// The single place where plugin settings are defined. No items yet: they are
// added by the roadmap steps that need them (e.g. the day boundary in step 3).
import type { PluginSettingsSchema } from "../orca.d.ts";

export interface SettingDefinition {
  /** What Orca shows in the settings page. */
  schema: PluginSettingsSchema[string];
  /**
   * Used when Orca holds no value. Needed for items without a `defaultValue`,
   * which Orca leaves `undefined` (spike: plugin-lifecycle-settings).
   */
  fallback?: unknown;
}

export type SettingsDefinition = Record<string, SettingDefinition>;

export const settingsDefinition: SettingsDefinition = {};

export type Settings = Record<string, unknown>;

/** Hands the schema to Orca. Skipped when there is nothing to define. */
export async function applySettingsSchema(
  pluginName: string,
  definition: SettingsDefinition,
): Promise<void> {
  const entries = Object.entries(definition);
  if (entries.length === 0) return;
  const schema: PluginSettingsSchema = Object.fromEntries(
    entries.map(([key, item]) => [key, item.schema]),
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
