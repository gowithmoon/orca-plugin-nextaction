import {
  type NoteLanguage,
  noteLanguageFor,
  type PropertyKey,
  propertyName,
} from "../infra/orca/codec/names";
import { createOrcaTaskRepository } from "../infra/orca/repository/orca-task-repository";
import type { RenamePlan } from "../infra/orca/schema/rename-plan";
import { runStartupPlan } from "../infra/orca/schema/run-startup-plan";
import { applyRename } from "../infra/orca/schema/tag-alias";
import { resolveTagName } from "../infra/orca/schema/tag-name";
import { readTaskTagCache } from "../infra/orca/schema/task-tag-cache";
import type { TaskTagState } from "../infra/orca/schema/task-tag-state";
import { systemClock } from "../infra/system-clock";
import { describeError } from "../shared/describe-error";
import { t } from "../shared/l10n/l10n";
import type { FeatureContext, FeatureModule } from "./bootstrap";
import { registerQueryInboxCommand } from "./dev/query-inbox-command";
import { registerReadTaskCommand } from "./dev/read-task-command";
import { registerWriteTaskCommands } from "./dev/write-task-commands";
import { writeSetting } from "./settings";

export interface TaskTagFeature {
  feature: FeatureModule;
  /** Where the task tag stands now; hand this to the task repository. */
  state: () => TaskTagState;
}

const settingKey = "taskTagName";

/** Text settings change on every keystroke; act once typing has stopped. */
const settleMs = 1000;

/** Property names as they appear on the tag, for messages. */
const namesOnTag = (keys: readonly PropertyKey[], language: NoteLanguage) =>
  keys.map((key) => propertyName(key, language)).join(", ");

const isBlank = (value: unknown) =>
  typeof value !== "string" || value.trim() === "";

/**
 * Finds or creates the task tag when the plugin loads and aligns it, then
 * follows renames in the settings (ADR 0002). A failure, a refused takeover or
 * invalidated properties are reported to the user but do not fail the load,
 * so the settings page stays usable (e.g. to pick another name).
 */
export function createTaskTagFeature(): TaskTagFeature {
  let state: TaskTagState = { kind: "paused", reason: "starting" };

  /** Startup: find, recover, create or align the tag, and report on it. */
  const start = async (
    { pluginName, settings }: FeatureContext,
    uiLanguage: NoteLanguage,
  ) => {
    state = { kind: "paused", reason: "starting" };
    const setting = settings()[settingKey];
    const cache = await readTaskTagCache(pluginName);
    const tagName = resolveTagName(setting, uiLanguage, cache);
    try {
      state = await runStartupPlan(pluginName, tagName, uiLanguage, cache);
    } catch (error) {
      state = { kind: "paused", reason: "failed" };
      orca.notify(
        "error",
        t('Could not set up the task tag "${name}": ${reason}', {
          name: tagName,
          reason: describeError(error),
        }),
        { title: pluginName },
      );
      return;
    }
    // The name is settled only now, so the default (or the cached name) is
    // written back after the tag is, and from then on no longer follows the
    // interface language. A name the user typed is left as it is.
    if (isBlank(setting)) {
      try {
        await writeSetting(pluginName, settingKey, tagName);
      } catch (error) {
        console.warn(
          `[${pluginName}] could not write the task tag name: ${describeError(error)}`,
        );
      }
    }
    // Reported on every start until the user resolves it (ADR 0008).
    if (state.kind === "paused" && state.reason === "refused") {
      orca.notify(
        "error",
        t(
          'A tag named "${name}" already exists and its properties ${properties} have a different type than the plugin needs. Task features are paused. Choose another task tag name in the plugin settings.',
          {
            name: tagName,
            properties: namesOnTag(state.conflicts, state.language),
          },
        ),
        { title: pluginName },
      );
    } else if (state.kind === "ready" && state.invalidated.length > 0) {
      orca.notify(
        "warn",
        t(
          'The properties ${properties} of the task tag "${name}" were changed to a different type. The plugin reads them as empty and will not write them until their type is changed back.',
          {
            name: tagName,
            properties: namesOnTag(state.invalidated, state.language),
          },
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
        resolveTagName(requested, uiLanguage) === state.tagName
      ) {
        return;
      }
      await start(context, uiLanguage);
      return;
    }
    const current = { tagBlockId: state.tagBlockId, tagName: state.tagName };
    let plan: RenamePlan;
    try {
      plan = await applyRename(pluginName, current, requested);
    } catch (error) {
      orca.notify(
        "error",
        t('Could not rename the task tag "${name}": ${reason}', {
          name: current.tagName,
          reason: describeError(error),
        }),
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
        // Repositories read `state()` on every call, so they see it at once.
        if (state.kind === "ready" && state.tagBlockId === current.tagBlockId) {
          state = { ...state, tagName: plan.to };
        }
        return;
      case "revert":
        try {
          // This write comes back through the subscription as "none".
          await writeSetting(pluginName, settingKey, plan.tagName);
        } catch (error) {
          // The tag keeps its name either way; the notice below still applies.
          console.warn(
            `[${pluginName}] could not set the task tag name back: ${describeError(error)}`,
          );
        }
        orca.notify(
          "warn",
          plan.reason === "empty"
            ? t(
                'The task tag name cannot be empty. It was set back to "${name}".',
                { name: plan.tagName },
              )
            : t(
                '"${requested}" is already used by another page or block, so the task tag was not renamed. The name was set back to "${name}".',
                { requested: plan.requested, name: plan.tagName },
              ),
          { title: pluginName },
        );
        return;
    }
  };

  const feature: FeatureModule = async (context) => {
    // Statically false in production builds, so the commands and the
    // repository they use are left out of the bundle (#20).
    if (import.meta.env.DEV) {
      const repository = createOrcaTaskRepository(
        () => state,
        // No caches yet; step 4 connects the view cache here.
        () => {},
      );
      registerReadTaskCommand(context.registry, repository);
      registerQueryInboxCommand(context.registry, repository);
      registerWriteTaskCommands(context.registry, repository, systemClock);
    }
    const uiLanguage = noteLanguageFor(orca.state.locale);
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
            console.error(`[${pluginName}] task tag rename failed`, error);
          }),
        );
      }, settleMs);
    });
  };

  return { feature, state: () => state };
}
