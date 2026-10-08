// DayBoundarySetting on the plugin settings. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import {
  type DayBoundary,
  defaultDayBoundary,
} from "../domain/time/logical-day";

/**
 * Reads the `time` setting through `read` on every call. Orca holds a whole
 * `Date`; only its local hours and minutes mean anything, the date part is the
 * day it was picked. No value (or anything but a valid `Date`) reads as 5:00
 * (spike: plugin-lifecycle-settings).
 */
export function createSettingsDayBoundary(
  read: () => unknown,
): DayBoundarySetting {
  return {
    current(): DayBoundary {
      const value = read();
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return defaultDayBoundary;
      }
      return { hours: value.getHours(), minutes: value.getMinutes() };
    },
  };
}
