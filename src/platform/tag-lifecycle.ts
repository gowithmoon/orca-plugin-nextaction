import type { NoteLanguage } from "../infra/orca/codec/names";
import type { RenamePlan } from "../infra/orca/schema/rename-plan";
import {
  runStartupPlan,
  type StartupOutcome,
} from "../infra/orca/schema/run-startup-plan";
import { applyRename } from "../infra/orca/schema/tag-alias";
import { readTagCache } from "../infra/orca/schema/tag-cache";
import { resolveTagName } from "../infra/orca/schema/tag-name";
import type { TagSchema } from "../infra/orca/schema/tag-schema";
import type { TagState } from "../infra/orca/schema/tag-state";
import { describeError } from "../shared/describe-error";
import type { FeatureContext } from "./bootstrap";
import { writeSetting } from "./settings";

/** Text settings change on every keystroke; act once typing has stopped. */
const settleMs = 1000;

const isBlank = (value: unknown) =>
  typeof value !== "string" || value.trim() === "";

/**
 * What the user is told about one tag. Each tag words its own messages, so
 * every `t()` key stays a literal (tests/translations.test.ts).
 */
export interface TagMessages {
  listenerFailed(reason: string): string;
  setupFailed(name: string, reason: string): string;
  renameFailed(name: string, reason: string): string;
  empty(name: string): string;
  taken(requested: string, name: string): string;
  /** `properties` are the conflicting property names, as on the tag. */
  refused(name: string, properties: string): string;
  invalidated(name: string, properties: string): string;
}

export interface TagLifecycleOptions<K extends string> {
  schema: TagSchema<K>;
  /** The setting holding the tag name. */
  settingKey: string;
  /** The `setData` key of the tag's cache. */
  cacheKey: string;
  messages: TagMessages;
  /** Names the tag in console output. */
  logName: string;
}

export interface TagLifecycle<K extends string> {
  /** Where the tag stands now; read on every call. */
  state(): TagState<K>;
  /** Called after every change of `state()`; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /**
   * Finds or creates the tag and aligns it, then follows renames in the
   * settings until unload (ADR 0002).
   */
  load(context: FeatureContext, uiLanguage: NoteLanguage): Promise<void>;
}

/**
 * The startup and rename mechanism of one plugin tag (#141). Every tag has
 * its own setting, cache and state; a failure, a refused takeover or
 * invalidated properties of one are reported to the user but do not fail the
 * load or touch another tag, so the settings page stays usable (e.g. to pick
 * another name).
 */
export function createTagLifecycle<K extends string>(
  options: TagLifecycleOptions<K>,
): TagLifecycle<K> {
  const { schema, settingKey, cacheKey, messages, logName } = options;
  let state: TagState<K> = { kind: "paused", reason: "starting" };
  const listeners = new Set<() => void>();
  /** Property names as they appear on the tag, for messages. */
  const namesOnTag = (keys: readonly K[], language: NoteLanguage) =>
    keys.map((key) => schema.propertyName(key, language)).join(", ");
  /**
   * Called after every assignment to `state`: startup (which passes through
   * `starting`), its outcome (alignment, invalidated properties, refusal,
   * failure) and renames.
   */
  const stateChanged = (pluginName: string) => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        // Kept for the stack; the notice tells the user.
        console.error(`[nextaction] ${logName} state listener failed`, error);
        orca.notify("error", messages.listenerFailed(describeError(error)), {
          title: pluginName,
        });
      }
    }
  };

  /** Startup: find, recover, create or align the tag, and report on it. */
  const start = async (
    { pluginName, settings }: FeatureContext,
    uiLanguage: NoteLanguage,
  ) => {
    // The block last known as the tag stays known while paused (#224).
    const previousId = "tagBlockId" in state ? state.tagBlockId : undefined;
    state = { kind: "paused", reason: "starting", tagBlockId: previousId };
    stateChanged(pluginName);
    const setting = settings()[settingKey];
    const cache = await readTagCache(pluginName, cacheKey);
    let tagName = resolveTagName(schema, setting, uiLanguage, cache);
    let reverted: StartupOutcome<K>["reverted"];
    try {
      const outcome = await runStartupPlan(
        schema,
        pluginName,
        cacheKey,
        tagName,
        uiLanguage,
        cache,
      );
      state = outcome.state;
      stateChanged(pluginName);
      reverted = outcome.reverted;
    } catch (error) {
      state = {
        kind: "paused",
        reason: "failed",
        tagBlockId: previousId ?? cache?.tagBlockId,
      };
      stateChanged(pluginName);
      orca.notify(
        "error",
        messages.setupFailed(tagName, describeError(error)),
        { title: pluginName },
      );
      return;
    }
    // The name was changed while the plugin was off to one another block
    // has: the cached tag was kept under its own name (ADR 0002).
    if (reverted && state.kind === "ready") tagName = state.tagName;
    // The name is settled only now, so the default (or the cached name) is
    // written back after the tag is, and from then on no longer follows the
    // interface language. A name the user typed is left as it is, unless it
    // had to be set back.
    if (isBlank(setting) || reverted) {
      try {
        await writeSetting(pluginName, settingKey, tagName);
      } catch (error) {
        console.warn(
          `[${pluginName}] could not write the ${logName} name: ${describeError(error)}`,
        );
      }
    }
    if (reverted) {
      orca.notify("warn", messages.taken(reverted.requested, tagName), {
        title: pluginName,
      });
    }
    // Reported on every start until the user resolves it (ADR 0008).
    if (state.kind === "paused" && state.reason === "refused") {
      orca.notify(
        "error",
        messages.refused(tagName, namesOnTag(state.conflicts, state.language)),
        { title: pluginName },
      );
    } else if (state.kind === "ready" && state.invalidated.length > 0) {
      orca.notify(
        "warn",
        messages.invalidated(
          tagName,
          namesOnTag(state.invalidated, state.language),
        ),
        { title: pluginName },
      );
    }
  };

  /** The name in the settings has stopped changing: rename, revert or retry. */
  const settle = async (context: FeatureContext, uiLanguage: NoteLanguage) => {
    const { pluginName, settings } = context;
    const requested = settings()[settingKey];
    if (state.kind !== "ready") {
      // No tag in use yet (refused or failed): a new name is looked up as at
      // startup. The refused name itself is not looked up again.
      if (state.kind === "paused" && state.reason === "starting") return;
      if (
        state.reason === "refused" &&
        resolveTagName(schema, requested, uiLanguage) === state.tagName
      ) {
        return;
      }
      await start(context, uiLanguage);
      return;
    }
    const current = { tagBlockId: state.tagBlockId, tagName: state.tagName };
    let plan: RenamePlan;
    try {
      plan = await applyRename(pluginName, cacheKey, current, requested);
    } catch (error) {
      orca.notify(
        "error",
        messages.renameFailed(current.tagName, describeError(error)),
        { title: pluginName },
      );
      // Whether the alias was renamed is unknown. The new name passed the
      // checks, so startup settles it: by name, or by rename recovery.
      await start(context, uiLanguage);
      return;
    }
    switch (plan.kind) {
      case "none":
        return;
      case "rename":
        // Readers call `state()` every time, so they see it at once.
        if (state.kind === "ready" && state.tagBlockId === current.tagBlockId) {
          state = { ...state, tagName: plan.to };
          stateChanged(pluginName);
        }
        return;
      case "revert":
        try {
          // This write comes back through the subscription as "none".
          await writeSetting(pluginName, settingKey, plan.tagName);
        } catch (error) {
          // The tag keeps its name either way; the notice below still applies.
          console.warn(
            `[${pluginName}] could not set the ${logName} name back: ${describeError(error)}`,
          );
        }
        orca.notify(
          "warn",
          plan.reason === "empty"
            ? messages.empty(plan.tagName)
            : messages.taken(plan.requested, plan.tagName),
          { title: pluginName },
        );
        return;
    }
  };

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async load(context, uiLanguage) {
      await start(context, uiLanguage);
      const { pluginName, registry } = context;
      const pluginState = orca.state.plugins[pluginName];
      if (!pluginState) return;
      // One settle at a time, in order, so renames never overlap.
      let queue: Promise<void> = Promise.resolve();
      let cancelPending: (() => void) | undefined;
      registry.subscribe(pluginState, () => {
        cancelPending?.();
        cancelPending = registry.timeout(() => {
          cancelPending = undefined;
          queue = queue.then(() =>
            settle(context, uiLanguage).catch((error: unknown) => {
              console.error(`[${pluginName}] ${logName} rename failed`, error);
            }),
          );
        }, settleMs);
      });
    },
  };
}
