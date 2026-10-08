import type { Clock } from "../application/ports/clock";
import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import { createSettingsDayBoundary } from "../infra/settings-day-boundary";
import { systemClock } from "../infra/system-clock";
import type { FeatureContext, FeatureModule } from "./bootstrap";
import { registerLogicalDayCommand } from "./dev/logical-day-command";

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
 * Development builds get a command that prints the current logical day, to
 * check the setting by hand. Change status reads the day boundary since #32;
 * removing this command is left to #33.
 */
export function createDayBoundaryFeature(
  clock: Clock = systemClock,
): FeatureModule {
  return (context) => {
    if (import.meta.env.DEV) {
      registerLogicalDayCommand(
        context.registry,
        dayBoundaryFrom(context),
        clock,
      );
    }
  };
}
