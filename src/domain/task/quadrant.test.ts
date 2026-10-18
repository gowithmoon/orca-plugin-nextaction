import { describe, expect, it } from "vitest";
import { type Quadrant, quadrantOf } from "./quadrant";

describe("quadrantOf", () => {
  it.each<[number, number, Quadrant]>([
    [5, 5, "importantUrgent"],
    [7, 7, "importantUrgent"],
    [5, 4, "importantNotUrgent"],
    [7, 1, "importantNotUrgent"],
    [4, 5, "urgentNotImportant"],
    [1, 7, "urgentNotImportant"],
    [4, 4, "notImportantNotUrgent"],
    [1, 1, "notImportantNotUrgent"],
  ])(
    "importance %s and urgency %s fall in %s",
    (importance, urgency, quadrant) => {
      expect(quadrantOf({ importance, urgency })).toBe(quadrant);
    },
  );

  it.each<[number | null, number | null, Quadrant]>([
    [null, null, "notImportantNotUrgent"],
    [8, 6, "urgentNotImportant"],
    [6, 0, "importantNotUrgent"],
    [5.5, 9, "notImportantNotUrgent"],
    [Number.NaN, 5, "urgentNotImportant"],
  ])(
    "reads unreadable or out-of-range importance %s and urgency %s as 4: %s",
    (importance, urgency, quadrant) => {
      expect(quadrantOf({ importance, urgency })).toBe(quadrant);
    },
  );
});
