// ReminderDefaultTimeSetting on the plugin settings. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { ReminderDefaultTimeSetting } from "../application/ports/reminder-default-time-setting";
import { reminderDefaultTimeFrom } from "../domain/reminder/reminder";

/**
 * Reads the `time` setting through `read` on every call: only its local
 * hours and minutes; no value (or anything but a valid `Date`) reads as 9:00.
 */
export function createSettingsReminderDefaultTime(
  read: () => unknown,
): ReminderDefaultTimeSetting {
  return {
    current: () => reminderDefaultTimeFrom(read()),
  };
}
