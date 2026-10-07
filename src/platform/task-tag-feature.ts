import { noteLanguageFor } from "../infra/orca/codec/names";
import { runStartupPlan } from "../infra/orca/schema/run-startup-plan";
import { resolveTagName } from "../infra/orca/schema/tag-name";
import { describeError } from "../shared/describe-error";
import { t } from "../shared/l10n/l10n";
import type { FeatureModule } from "./bootstrap";

/**
 * Finds or creates the task tag when the plugin loads. A failure is reported
 * to the user but does not fail the load, so the settings page stays usable
 * (e.g. to pick another name).
 */
export const taskTagFeature: FeatureModule = async ({
  pluginName,
  settings,
}) => {
  const uiLanguage = noteLanguageFor(orca.state.locale);
  const tagName = resolveTagName(settings().taskTagName, uiLanguage);
  try {
    await runStartupPlan(tagName, uiLanguage);
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
};
