import { describe, expect, it } from "vitest";
import { unplacedTaskDates } from "./unplaced-schedule";

describe("unplacedTaskDates", () => {
  it("starts on the day dropped and is due a week on, the bar a week long", () => {
    expect(unplacedTaskDates({ year: 2026, month: 10, day: 20 })).toEqual({
      start: { year: 2026, month: 10, day: 20 },
      due: { year: 2026, month: 10, day: 26 },
    });
  });

  it("runs across the end of a month and of a year", () => {
    expect(unplacedTaskDates({ year: 2026, month: 12, day: 28 })).toEqual({
      start: { year: 2026, month: 12, day: 28 },
      due: { year: 2027, month: 1, day: 3 },
    });
  });
});
