// A StartPreviewDaysSetting for tests: it holds a set count of days until the
// test changes it.
import type { StartPreviewDaysSetting } from "../src/application/ports/start-preview-days-setting";

export interface FixedStartPreviewDays extends StartPreviewDaysSetting {
  /** Changes the days, as if the user edited the setting. */
  set(days: number): void;
}

export function createFixedStartPreviewDays(days = 0): FixedStartPreviewDays {
  let current = days;
  return {
    current: () => current,
    set(next) {
      current = next;
    },
  };
}
