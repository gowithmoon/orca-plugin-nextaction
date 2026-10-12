import type { TimeOfDay } from "../../domain/reminder/reminder";

/**
 * The reminder default time the user has set: the time of day the quick
 * options fall at (GLOSSARY: 提醒). Read on every use, so a change in the
 * settings applies without restarting the plugin.
 */
export interface ReminderDefaultTimeSetting {
  current(): TimeOfDay;
}
