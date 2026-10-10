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
  // language at first start, is resolved where the tag is looked up and then
  // written back here, so it no longer follows the language (ADR 0002).
  taskTagName: {
    schema: () => ({
      label: t("Task tag name"),
      description: t(
        "The Orca tag that marks a block as a task. Changing it renames the tag; existing tasks keep it.",
      ),
      type: "string",
    }),
  },
  // No `defaultValue`: Orca leaves the item `undefined`, and the day boundary
  // reads that as 5:00 (infra/settings-day-boundary.ts).
  dayBoundary: {
    schema: () => ({
      label: t("Day boundary"),
      description: t(
        "A day starts at this time. Usually set in the early morning.",
      ),
      type: "time",
    }),
  },
  // Read through startPreviewDaysFrom: anything but a whole number from 0 to
  // 14 counts as 0 (infra/settings-start-preview-days.ts).
  startPreviewDays: {
    schema: () => ({
      label: t("Start preview days"),
      description: t(
        "Tasks that start within this many days show in the next actions already, with a slightly lower score. A whole number from 0 to 14; 0 shows only tasks that can start today.",
      ),
      type: "number",
      defaultValue: 0,
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

/**
 * Sets one setting of this repo. `setSettings` replaces the whole object
 * (plugin-lifecycle-settings spike), so the others are carried over; the
 * settings subscription fires once for this write, before it returns.
 */
export async function writeSetting(
  pluginName: string,
  key: string,
  value: unknown,
): Promise<void> {
  const stored = orca.state.plugins[pluginName]?.settings ?? {};
  await orca.plugins.setSettings("repo", pluginName, {
    ...stored,
    [key]: value,
  });
}
