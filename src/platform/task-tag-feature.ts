import type { TaskRepository } from "../application/ports/task-repository";
import type { TaskTagNamesSource } from "../application/ports/task-tag-names";
import { createConvertToTask } from "../application/usecases/convert-to-task";
import { createQuickCapture } from "../application/usecases/quick-capture";
import {
  type NoteLanguage,
  noteLanguageFor,
  type PropertyKey,
  propertyName,
} from "../infra/orca/codec/names";
import { createOrcaTaskRepository } from "../infra/orca/repository/orca-task-repository";
import type { RenamePlan } from "../infra/orca/schema/rename-plan";
import {
  runStartupPlan,
  type StartupOutcome,
} from "../infra/orca/schema/run-startup-plan";
import { applyRename } from "../infra/orca/schema/tag-alias";
import { resolveTagName } from "../infra/orca/schema/tag-name";
import { readTaskTagCache } from "../infra/orca/schema/task-tag-cache";
import { taskTagNamesFor } from "../infra/orca/schema/task-tag-names";
import type { TaskTagState } from "../infra/orca/schema/task-tag-state";
import { systemClock } from "../infra/system-clock";
import { describeError } from "../shared/describe-error";
import { t } from "../shared/l10n/l10n";
import { createQuickCaptureCommand } from "../ui/capture/quick-capture-popup";
import { createConvertToTaskCommand } from "../ui/commands/convert-to-task-command";
import type { FeatureContext, FeatureModule } from "./bootstrap";
import { writeSetting } from "./settings";

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
export function createTaskTagFeature(): {
  feature: FeatureModule;
  /** The tag's note-facing names, following every change of the tag state. */
  names: TaskTagNamesSource;
  /** Tasks in the notes; it reads the tag state on every call. */
  repository: TaskRepository;
  /** The task tag block's ID; `undefined` while task features are paused. */
  taskTagBlockId: () => number | undefined;
} {
  let state: TaskTagState = { kind: "paused", reason: "starting" };
  const listeners = new Set<() => void>();
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
        console.error("[nextaction] task tag state listener failed", error);
        orca.notify(
          "error",
          t(
            "A feature could not follow the change of the task tag: ${reason}",
            { reason: describeError(error) },
          ),
          { title: pluginName },
        );
      }
    }
  };
  const names: TaskTagNamesSource = {
    current: () => taskTagNamesFor(state),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  /** Startup: find, recover, create or align the tag, and report on it. */
  const start = async (
    { pluginName, settings }: FeatureContext,
    uiLanguage: NoteLanguage,
  ) => {
    state = { kind: "paused", reason: "starting" };
    stateChanged(pluginName);
    const setting = settings()[settingKey];
    const cache = await readTaskTagCache(pluginName);
    let tagName = resolveTagName(setting, uiLanguage, cache);
    let reverted: StartupOutcome["reverted"];
    try {
      const outcome = await runStartupPlan(
        pluginName,
        tagName,
        uiLanguage,
        cache,
      );
      state = outcome.state;
      stateChanged(pluginName);
      reverted = outcome.reverted;
    } catch (error) {
      state = { kind: "paused", reason: "failed" };
      stateChanged(pluginName);
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
          `[${pluginName}] could not write the task tag name: ${describeError(error)}`,
        );
      }
    }
    if (reverted) {
      orca.notify(
        "warn",
        t(
          '"${requested}" is already used by another page or block, so the task tag was not renamed. The name was set back to "${name}".',
          { requested: reverted.requested, name: tagName },
        ),
        { title: pluginName },
      );
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

  const repository = createOrcaTaskRepository(
    () => state,
    // No caches yet; step 4 connects the view cache here.
    () => {},
  );

  const feature: FeatureModule = async (context) => {
    // No shortcut is assigned: the user binds one in Orca's settings.
    context.registry.editorCommand(
      "convertToTask",
      createConvertToTaskCommand(
        createConvertToTask({ repository }),
        context.pluginName,
      ),
      // The repository's invokeGroup is the undo unit.
      () => undefined,
      { label: t("Convert to task") },
    );
    // The popup's own root, empty until the command opens it; unload
    // unmounts it.
    const captureRoot = context.registry.reactRoot("quickCapturePopup", null);
    context.registry.command(
      "quickCapture",
      createQuickCaptureCommand(
        createQuickCapture({ repository, clock: systemClock }),
        context.pluginName,
        captureRoot.render,
      ),
      t("Quick capture"),
    );
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

  const taskTagBlockId = () =>
    state.kind === "ready" ? state.tagBlockId : undefined;

  return { feature, names, repository, taskTagBlockId };
}
