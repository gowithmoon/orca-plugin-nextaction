import { describe, expect, it } from "vitest";
import { isDueSoon, quickDueDate } from "./due-steps";

const october = (day: number) => ({ year: 2026, month: 10, day });
// Wednesday October 14, 2026.
const today = october(14);

describe("due in the next 7 days", () => {
  it("is due soon from today up to today plus 6 logical days", () => {
    expect(isDueSoon({ status: "todo", due: october(14) }, today)).toBe(true);
    expect(isDueSoon({ status: "todo", due: october(20) }, today)).toBe(true);
  });

  it("is not due soon on today plus 7", () => {
    expect(isDueSoon({ status: "todo", due: october(21) }, today)).toBe(false);
  });

  it("is not due soon once overdue", () => {
    expect(isDueSoon({ status: "todo", due: october(13) }, today)).toBe(false);
  });

  it("is not due soon when done", () => {
    expect(isDueSoon({ status: "done", due: october(15) }, today)).toBe(false);
  });

  it("is not due soon without a due date", () => {
    expect(isDueSoon({ status: "todo", due: null }, today)).toBe(false);
  });

  it("counts the 7 days across a month's end", () => {
    const halloween = october(31);
    const november = (day: number) => ({ year: 2026, month: 11, day });
    expect(isDueSoon({ status: "todo", due: november(6) }, halloween)).toBe(
      true,
    );
    expect(isDueSoon({ status: "todo", due: november(7) }, halloween)).toBe(
      false,
    );
  });
});

describe("quick due dates", () => {
  it("moves to tomorrow, across a month's end", () => {
    expect(quickDueDate("tomorrow", october(31))).toEqual({
      year: 2026,
      month: 11,
      day: 1,
    });
  });

  it("moves to next Monday: the Monday of the next week", () => {
    // Wednesday October 14 → Monday October 19.
    expect(quickDueDate("nextMonday", october(14))).toEqual(october(19));
    // A Sunday: the very next day.
    expect(quickDueDate("nextMonday", october(18))).toEqual(october(19));
    // A Monday: a week later, not today.
    expect(quickDueDate("nextMonday", october(19))).toEqual(october(26));
  });
});
