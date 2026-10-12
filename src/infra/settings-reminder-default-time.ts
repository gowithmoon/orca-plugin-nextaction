// ReminderDefaultTimeSetting on the plugin settings. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { ReminderDefaultTimeSetting } from "../application/ports/reminder-default-time-setting";
import { defaultReminderTime } from "../domain/reminder/reminder";
import type { TimeOfDay } from "../domain/time/time-of-day";

/**
 * Reads the `time` setting through `read` on every call. Orca holds a whole
 * `Date`; only its local hours and minutes mean anything. No value (or
 * anything but a valid `Date`) reads as 9:00, as the day boundary reads
 * (spike: plugin-lifecycle-settings).
 */
export function createSettingsReminderDefaultTime(
  read: () => unknown,
): ReminderDefaultTimeSetting {
  return {
    current(): TimeOfDay {
      const value = read();
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return defaultReminderTime;
      }
      return { hours: value.getHours(), minutes: value.getMinutes() };
    },
  };
}
