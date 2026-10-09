import type { StartPreviewDaysSetting } from "../application/ports/start-preview-days-setting";
import { createSettingsStartPreviewDays } from "../infra/settings-start-preview-days";
import type { ChangeSignal } from "../shared/change-signal";
import type { FeatureModule } from "./bootstrap";

/**
 * The start preview days of the current load (#56), for what is created
 * before any load (use cases): 0 until `feature` loads, then read from the
 * settings on every use. A change of the setting gives the task change
 * signal, so the next action view reads again. Verified by hand in Orca
 * (docs/ARCHITECTURE.md §5).
 */
export function createLoadStartPreviewDays(changes: ChangeSignal): {
  feature: FeatureModule;
  startPreviewDays: StartPreviewDaysSetting;
} {
  let current: StartPreviewDaysSetting = { current: () => 0 };
  const startPreviewDays: StartPreviewDaysSetting = {
    current: () => current.current(),
  };
  const feature: FeatureModule = ({ pluginName, registry, settings }) => {
    const loaded = createSettingsStartPreviewDays(
      () => settings().startPreviewDays,
    );
    current = loaded;
    const pluginState = orca.state.plugins[pluginName];
    if (!pluginState) return;
    // Every settings change fires this, the plugin's own writes included
    // (plugin-lifecycle-settings); only a change of this value is signalled.
    let last = loaded.current();
    registry.subscribe(pluginState, () => {
      const next = loaded.current();
      if (next === last) return;
      last = next;
      changes.changed();
    });
  };
  return { feature, startPreviewDays };
}
