import {
  type NoteLanguage,
  noteLanguageFor,
  type PropertyKey,
  propertyName,
} from "../infra/orca/codec/names";
import { createOrcaTaskRepository } from "../infra/orca/repository/orca-task-repository";
import { runStartupPlan } from "../infra/orca/schema/run-startup-plan";
import { resolveTagName } from "../infra/orca/schema/tag-name";
import type { TaskTagState } from "../infra/orca/schema/task-tag-state";
import { describeError } from "../shared/describe-error";
import { t } from "../shared/l10n/l10n";
import type { FeatureModule } from "./bootstrap";
import { registerReadTaskCommand } from "./dev/read-task-command";

export interface TaskTagFeature {
  feature: FeatureModule;
  /** Where the task tag stands now; hand this to the task repository. */
  state: () => TaskTagState;
}

/** Property names as they appear on the tag, for messages. */
const namesOnTag = (keys: readonly PropertyKey[], language: NoteLanguage) =>
  keys.map((key) => propertyName(key, language)).join(", ");

/**
 * Finds or creates the task tag when the plugin loads and aligns it. A
 * failure, a refused takeover or invalidated properties are reported to the
 * user but do not fail the load, so the settings page stays usable (e.g. to
 * pick another name).
 */
export function createTaskTagFeature(): TaskTagFeature {
  let state: TaskTagState = { kind: "paused", reason: "starting" };

  const feature: FeatureModule = async ({ pluginName, registry, settings }) => {
    state = { kind: "paused", reason: "starting" };
    // Statically false in production builds, so the command and the
    // repository it uses are left out of the bundle (#20).
    if (import.meta.env.DEV) {
      registerReadTaskCommand(
        registry,
        createOrcaTaskRepository(() => state),
      );
    }
    const uiLanguage = noteLanguageFor(orca.state.locale);
    const tagName = resolveTagName(settings().taskTagName, uiLanguage);
    try {
      state = await runStartupPlan(pluginName, tagName, uiLanguage);
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

  return { feature, state: () => state };
}
