import { noteLanguageFor } from "../infra/orca/codec/names";
import type { TaskTagContext } from "../infra/orca/codec/task-codec";
import { createOrcaTaskRepository } from "../infra/orca/repository/orca-task-repository";
import { runStartupPlan } from "../infra/orca/schema/run-startup-plan";
import { resolveTagName } from "../infra/orca/schema/tag-name";
import { describeError } from "../shared/describe-error";
import { t } from "../shared/l10n/l10n";
import type { FeatureModule } from "./bootstrap";
import { registerReadTaskCommand } from "./dev/read-task-command";

/**
 * Finds or creates the task tag when the plugin loads. A failure is reported
 * to the user but does not fail the load, so the settings page stays usable
 * (e.g. to pick another name).
 */
export const taskTagFeature: FeatureModule = async ({
  pluginName,
  registry,
  settings,
}) => {
  const uiLanguage = noteLanguageFor(orca.state.locale);
  const tagName = resolveTagName(settings().taskTagName, uiLanguage);
  // Unset while task features are unavailable.
  let tag: TaskTagContext | undefined;
  try {
    const tagBlockId = await runStartupPlan(tagName, uiLanguage);
    // The invalidated properties come from the startup plan once #19 lands.
    tag = { tagBlockId, invalidated: [] };
  } catch (error) {
    orca.notify(
      "error",
      t('Could not set up the task tag "${name}": ${reason}', {
        name: tagName,
        reason: describeError(error),
      }),
      { title: pluginName },
    );
  }
  const repository = createOrcaTaskRepository(() => tag);
  // Statically false in production builds, so the command is left out of
  // the bundle (checked by grepping dist; see the #20 manual checklist).
  if (import.meta.env.DEV) registerReadTaskCommand(registry, repository);
};
