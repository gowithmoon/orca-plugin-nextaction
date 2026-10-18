import { describe, expect, it } from "vitest";
import { type Quadrant, quadrantChanges, quadrantOf } from "./quadrant";

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

describe("quadrantChanges", () => {
  it.each<[number, number, Quadrant, object]>([
    [2, 3, "importantUrgent", { importance: 5, urgency: 5 }],
    [2, 3, "importantNotUrgent", { importance: 5 }],
    [2, 3, "urgentNotImportant", { urgency: 5 }],
    [6, 7, "notImportantNotUrgent", { importance: 4, urgency: 4 }],
    [6, 7, "importantNotUrgent", { urgency: 4 }],
    [6, 7, "urgentNotImportant", { importance: 4 }],
    [6, 2, "importantUrgent", { urgency: 5 }],
    [1, 7, "importantUrgent", { importance: 5 }],
  ])(
    "importance %s and urgency %s moved to %s write %o",
    (importance, urgency, target, changes) => {
      expect(quadrantChanges({ importance, urgency }, target)).toEqual(changes);
    },
  );

  it.each<[number, number, Quadrant]>([
    [7, 6, "importantUrgent"],
    [5, 1, "importantNotUrgent"],
    [3, 5, "urgentNotImportant"],
    [4, 4, "notImportantNotUrgent"],
  ])(
    "importance %s and urgency %s moved to their own %s write nothing",
    (importance, urgency, target) => {
      expect(quadrantChanges({ importance, urgency }, target)).toEqual({});
    },
  );

  it("judges an unreadable or out-of-range value as 4", () => {
    expect(
      quadrantChanges(
        { importance: 9, urgency: null },
        "notImportantNotUrgent",
      ),
    ).toEqual({});
    expect(
      quadrantChanges({ importance: 0, urgency: 9 }, "importantUrgent"),
    ).toEqual({ importance: 5, urgency: 5 });
  });
});
