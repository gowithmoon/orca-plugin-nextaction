// A ReminderDefaultTimeSetting for tests: it holds a set time until the test
// changes it.
import type { ReminderDefaultTimeSetting } from "../src/application/ports/reminder-default-time-setting";
import { defaultReminderTime } from "../src/domain/reminder/reminder";
import type { TimeOfDay } from "../src/domain/time/time-of-day";

export interface FixedReminderDefaultTime extends ReminderDefaultTimeSetting {
  /** Changes the time, as if the user edited the setting. */
  set(time: TimeOfDay): void;
}

export function createFixedReminderDefaultTime(
  time: TimeOfDay = defaultReminderTime,
): FixedReminderDefaultTime {
  let current = time;
  return {
    current: () => current,
    set(next) {
      current = next;
    },
  };
}
