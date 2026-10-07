// A Clock for tests: it shows a set time until the test changes it.
import type { Clock } from "../src/application/ports/clock";

export interface FixedClock extends Clock {
  /** Moves the clock to `at`, e.g. "2026-10-07T09:00:00+08:00". */
  set(at: Date | string): void;
}

export function createFixedClock(at: Date | string): FixedClock {
  let current = new Date(at);
  return {
    // A copy, so a caller mutating the Date cannot move the clock.
    now: () => new Date(current),
    set(next) {
      current = new Date(next);
    },
  };
}
