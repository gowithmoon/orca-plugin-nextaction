// The single place where plugin settings are defined.
import type { PluginSettingsSchema } from "../orca.d.ts";
import { t } from "../shared/l10n/l10n";

export interface SettingDefinition {
  /**
   * What Orca shows in the settings page. A function so that `t()` runs after
   * `setupL10N` in `load`, not when this module is imported.
   */
  schema: () => PluginSettingsSchema[string];
  /**
   * Used when Orca holds no value. Needed for items without a `defaultValue`,
   * which Orca leaves `undefined` (spike: plugin-lifecycle-settings).
   */
  fallback?: unknown;
}

export type SettingsDefinition = Record<string, SettingDefinition>;

export const settingsDefinition: SettingsDefinition = {
  // No `defaultValue` and no fallback: the default follows the interface
  // language at first start and is resolved where the tag is looked up
  // (spec #16). Writing it back into the settings is #23.
  taskTagName: {
    schema: () => ({
      label: t("Task tag name"),
      description: t(
        "The Orca tag that marks a block as a task. Leave empty to use the default name.",
      ),
      type: "string",
    }),
  },
};

export type Settings = Record<string, unknown>;

/** Hands the schema to Orca. Skipped when there is nothing to define. */
export async function applySettingsSchema(
  pluginName: string,
  definition: SettingsDefinition,
): Promise<void> {
  const entries = Object.entries(definition);
  if (entries.length === 0) return;
  const schema: PluginSettingsSchema = Object.fromEntries(
    entries.map(([key, item]) => [key, item.schema()]),
  );
  await orca.plugins.setSettingsSchema(pluginName, schema);
}

/** Reads current values; call after `applySettingsSchema`. */
export function readSettings(
  pluginName: string,
  definition: SettingsDefinition,
): Settings {
  const stored = orca.state.plugins[pluginName]?.settings ?? {};
  return Object.fromEntries(
    Object.entries(definition).map(([key, item]) => [
      key,
      stored[key] ?? item.fallback,
    ]),
  );
}
