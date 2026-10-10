import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { CalendarDate } from "../domain/task/task";
import { defaultDayBoundary, logicalDay } from "../domain/time/logical-day";
import { createSettingsDayBoundary } from "../infra/settings-day-boundary";
import { systemClock } from "../infra/system-clock";
import type { ChangeSignalSource } from "../shared/change-signal";
import type { FeatureContext, FeatureModule } from "./bootstrap";

/**
 * The day boundary for use cases, read from the settings of this load on
 * every use, so a change applies at once.
 */
export function dayBoundaryFrom({
  settings,
}: FeatureContext): DayBoundarySetting {
  return createSettingsDayBoundary(() => settings().dayBoundary);
}

/**
 * The day boundary of the current load, for what is created before any load
 * (use cases, views): the default until `feature` loads. Verified by hand in
 * Orca (docs/ARCHITECTURE.md §5).
 */
export function createLoadDayBoundary(): {
  feature: FeatureModule;
  dayBoundary: DayBoundarySetting;
  /** The current logical day by it. */
  today: () => CalendarDate;
  /**
   * Signals a change of the setting's value, for a view that holds today's
   * time range (the My Day view, #81). Not the task change signal: the other
   * views read by the logical day alone, and nothing about tasks changed.
   */
  changes: ChangeSignalSource;
} {
  let current: DayBoundarySetting = { current: () => defaultDayBoundary };
  const dayBoundary: DayBoundarySetting = { current: () => current.current() };
  const listeners = new Set<() => void>();
  const minutesOf = (setting: DayBoundarySetting) => {
    const { hours, minutes } = setting.current();
    return hours * 60 + minutes;
  };
  return {
    feature: (context) => {
      const loaded = dayBoundaryFrom(context);
      current = loaded;
      const pluginState = orca.state.plugins[context.pluginName];
      if (!pluginState) return;
      // Every settings change fires this, the plugin's own writes included
      // (plugin-lifecycle-settings); only a change of this value is signalled.
      let last = minutesOf(loaded);
      context.registry.subscribe(pluginState, () => {
        const next = minutesOf(loaded);
        if (next === last) return;
        last = next;
        for (const listener of [...listeners]) listener();
      });
    },
    dayBoundary,
    today: () => logicalDay(systemClock.now(), dayBoundary.current()),
    changes: {
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
}
