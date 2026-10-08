// A DayBoundarySetting for tests: it holds a set boundary until the test
// changes it.
import type { DayBoundarySetting } from "../src/application/ports/day-boundary-setting";
import {
  type DayBoundary,
  defaultDayBoundary,
} from "../src/domain/time/logical-day";

export interface FixedDayBoundary extends DayBoundarySetting {
  /** Changes the boundary, as if the user edited the setting. */
  set(boundary: DayBoundary): void;
}

export function createFixedDayBoundary(
  boundary: DayBoundary = defaultDayBoundary,
): FixedDayBoundary {
  let current = boundary;
  return {
    current: () => current,
    set(next) {
      current = next;
    },
  };
}
