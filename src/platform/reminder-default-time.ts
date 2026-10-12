import type { ReminderDefaultTimeSetting } from "../application/ports/reminder-default-time-setting";
import { defaultReminderTime } from "../domain/reminder/reminder";
import { createSettingsReminderDefaultTime } from "../infra/settings-reminder-default-time";
import type { FeatureModule } from "./bootstrap";

/**
 * The reminder default time of the current load, for what is created before
 * any load (use cases, the reminder popup): 9:00 until `feature` loads, then
 * read from the settings on every use. Nothing listens for a change: the
 * quick options read it when the popup works them out. Verified by hand in
 * Orca (docs/ARCHITECTURE.md §5).
 */
export function createLoadReminderDefaultTime(): {
  feature: FeatureModule;
  reminderDefaultTime: ReminderDefaultTimeSetting;
} {
  let current: ReminderDefaultTimeSetting = {
    current: () => defaultReminderTime,
  };
  const reminderDefaultTime: ReminderDefaultTimeSetting = {
    current: () => current.current(),
  };
  const feature: FeatureModule = ({ settings }) => {
    current = createSettingsReminderDefaultTime(
      () => settings().reminderDefaultTime,
    );
  };
  return { feature, reminderDefaultTime };
}
