import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { CalendarDate } from "../domain/task/task";
import { defaultDayBoundary, logicalDay } from "../domain/time/logical-day";
import { createSettingsDayBoundary } from "../infra/settings-day-boundary";
import { systemClock } from "../infra/system-clock";
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
 * (use cases, views): the default until `feature` loads.
 */
export function createLoadDayBoundary(): {
  feature: FeatureModule;
  dayBoundary: DayBoundarySetting;
  /** The current logical day by it. */
  today: () => CalendarDate;
} {
  let current: DayBoundarySetting = { current: () => defaultDayBoundary };
  const dayBoundary: DayBoundarySetting = { current: () => current.current() };
  return {
    feature: (context) => {
      current = dayBoundaryFrom(context);
    },
    dayBoundary,
    today: () => logicalDay(systemClock.now(), dayBoundary.current()),
  };
}
