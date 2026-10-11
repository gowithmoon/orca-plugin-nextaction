import { describe, expect, it } from "vitest";
import {
  countEnd,
  countsFrom,
  isLastOccurrence,
  nextOccurrence,
  planAdvance,
  type RecurrenceRule,
} from "./recurrence";

const day = (year: number, month: number, date: number) => ({
  year,
  month,
  day: date,
});

describe("next occurrence", () => {
  it("every N days is N days after the day it counts from", () => {
    expect(
      nextOccurrence({ interval: 3, unit: "day" }, day(2026, 10, 30)),
    ).toEqual(day(2026, 11, 2));
  });

  it("every N weeks falls on the same weekday N weeks later", () => {
    // Monday 2026-10-12 → Monday 2026-10-26.
    expect(
      nextOccurrence({ interval: 2, unit: "week" }, day(2026, 10, 12)),
    ).toEqual(day(2026, 10, 26));
  });

  it("every N months falls on the same day of the month N months later", () => {
    expect(
      nextOccurrence({ interval: 3, unit: "month" }, day(2026, 11, 15)),
    ).toEqual(day(2027, 2, 15));
  });

  it("every month skips a month without that day: January 31 is followed by March 31", () => {
    expect(
      nextOccurrence({ interval: 1, unit: "month" }, day(2027, 1, 31)),
    ).toEqual(day(2027, 3, 31));
  });

  it("every N years falls on the same day N years later", () => {
    expect(
      nextOccurrence({ interval: 2, unit: "year" }, day(2026, 10, 12)),
    ).toEqual(day(2028, 10, 12));
  });

  it("every year skips years without February 29", () => {
    expect(
      nextOccurrence({ interval: 1, unit: "year" }, day(2028, 2, 29)),
    ).toEqual(day(2032, 2, 29));
  });
});

describe("the day the next occurrence counts from", () => {
  const week = { interval: 1, unit: "week" } as const;
  const completedOn = day(2026, 10, 14);

  it("on a fixed schedule is the due date", () => {
    expect(
      countsFrom(
        { period: week, basis: "schedule" },
        { start: day(2026, 10, 9), due: day(2026, 10, 12) },
        completedOn,
      ),
    ).toEqual(day(2026, 10, 12));
  });

  it("on a fixed schedule without a due date is the start date", () => {
    expect(
      countsFrom(
        { period: week, basis: "schedule" },
        { start: day(2026, 10, 9), due: null },
        completedOn,
      ),
    ).toEqual(day(2026, 10, 9));
  });

  it("on a fixed schedule without dates is the logical day it was completed", () => {
    expect(
      countsFrom(
        { period: week, basis: "schedule" },
        { start: null, due: null },
        completedOn,
      ),
    ).toEqual(completedOn);
  });

  it("after completion is the logical day it was completed, whatever the dates", () => {
    expect(
      countsFrom(
        { period: week, basis: "completion" },
        { start: day(2026, 10, 9), due: day(2026, 10, 12) },
        completedOn,
      ),
    ).toEqual(completedOn);
  });

  it("on a fixed schedule overdue by several periods, the next occurrence is still in the past", () => {
    // Due Monday September 7, done on October 14: next is September 14, to be
    // done or skipped in turn.
    const rule = { period: week, basis: "schedule" } as const;
    const from = countsFrom(
      rule,
      { start: null, due: day(2026, 9, 7) },
      completedOn,
    );
    expect(nextOccurrence(rule.period, from)).toEqual(day(2026, 9, 14));
  });
});

describe("advancing a recurring task once it is completed", () => {
  const completion = {
    at: new Date("2026-10-14T01:00:00.000Z"),
    day: day(2026, 10, 14),
  };
  const weekly = {
    period: { interval: 1, unit: "week" },
    basis: "schedule",
  } as const;

  it("goes back to todo with the due date on the next occurrence", () => {
    const plan = planAdvance(
      weekly,
      { status: "doing", start: null, due: day(2026, 10, 12) },
      [],
      completion,
    );
    // Only what moves is written: no start to keep in step.
    expect(plan.changes).toEqual({ status: "todo", due: day(2026, 10, 19) });
    expect(plan.next).toEqual(day(2026, 10, 19));
  });

  it("moves the start with the due date, keeping the days between them", () => {
    // Start three days before a Friday due date, every week.
    const plan = planAdvance(
      weekly,
      { status: "todo", start: day(2026, 10, 13), due: day(2026, 10, 16) },
      [],
      completion,
    );
    expect(plan.changes).toEqual({
      status: "todo",
      start: day(2026, 10, 20),
      due: day(2026, 10, 23),
    });
  });

  it("with only a start date, moves the start date to the next occurrence", () => {
    const plan = planAdvance(
      weekly,
      { status: "todo", start: day(2026, 10, 12), due: null },
      [],
      completion,
    );
    expect(plan.changes).toEqual({ status: "todo", start: day(2026, 10, 19) });
  });

  it("without dates, writes the next occurrence as the start date, counted from the completion", () => {
    const plan = planAdvance(
      weekly,
      { status: "doing", start: null, due: null },
      [],
      completion,
    );
    expect(plan.changes).toEqual({ status: "todo", start: day(2026, 10, 21) });
    expect(plan.next).toEqual(day(2026, 10, 21));
  });

  it("appends the completion after the ones already recorded", () => {
    const earlier = {
      at: new Date("2026-10-07T01:00:00.000Z"),
      day: day(2026, 10, 7),
    };
    const plan = planAdvance(
      weekly,
      { status: "todo", start: null, due: day(2026, 10, 12) },
      [earlier],
      completion,
    );
    expect(plan.history).toEqual([earlier, completion]);
  });
});

describe("end conditions", () => {
  const completion = {
    at: new Date("2026-10-14T01:00:00.000Z"),
    day: day(2026, 10, 14),
  };
  const weeklyEnding = (end: RecurrenceRule["end"]): RecurrenceRule => ({
    period: { interval: 1, unit: "week" },
    basis: "schedule",
    end,
  });
  const dueMonday = {
    status: "todo",
    start: null,
    due: day(2026, 10, 12),
  } as const;

  it("each advance uses up one of the remaining occurrences", () => {
    const plan = planAdvance(
      weeklyEnding({ kind: "count", total: 5, remaining: 3 }),
      dueMonday,
      [],
      completion,
    );
    expect(plan).toMatchObject({
      last: false,
      next: day(2026, 10, 19),
      changes: { status: "todo", due: day(2026, 10, 19) },
      recurrence: weeklyEnding({ kind: "count", total: 5, remaining: 2 }),
    });
  });

  it("completing the one remaining occurrence is the last: the task stays done and the rule is removed", () => {
    const plan = planAdvance(
      weeklyEnding({ kind: "count", total: 5, remaining: 1 }),
      dueMonday,
      [],
      completion,
    );
    expect(plan).toEqual({
      last: true,
      changes: { status: "done" },
      history: [completion],
      next: null,
      recurrence: null,
    });
  });

  it("an occurrence on the end day still happens", () => {
    const plan = planAdvance(
      weeklyEnding({ kind: "until", day: day(2026, 10, 19) }),
      dueMonday,
      [],
      completion,
    );
    expect(plan).toMatchObject({ last: false, next: day(2026, 10, 19) });
    // The end day is not used up: the rule is not rewritten.
    expect(plan).not.toHaveProperty("recurrence");
  });

  it.each([
    ["no end condition", undefined, false],
    [
      "one occurrence remaining",
      { kind: "count", total: 5, remaining: 1 },
      true,
    ],
    [
      "two occurrences remaining",
      { kind: "count", total: 5, remaining: 2 },
      false,
    ],
    [
      "the next occurrence on the end day",
      { kind: "until", day: day(2026, 10, 19) },
      false,
    ],
    [
      "the next occurrence after the end day",
      { kind: "until", day: day(2026, 10, 18) },
      true,
    ],
  ] as const)(
    "whether this is the last occurrence, with %s",
    (_, end, last) => {
      expect(
        isLastOccurrence(weeklyEnding(end), dueMonday, completion.day),
      ).toBe(last);
    },
  );

  it("setting N times counts N occurrences remaining", () => {
    expect(countEnd(5, undefined)).toEqual({
      kind: "count",
      total: 5,
      remaining: 5,
    });
  });

  it("keeping the same N times keeps the occurrences remaining; another N starts over", () => {
    const current = { kind: "count", total: 5, remaining: 3 } as const;
    expect(countEnd(5, current)).toEqual(current);
    expect(countEnd(4, current)).toEqual({
      kind: "count",
      total: 4,
      remaining: 4,
    });
  });

  it("a next occurrence after the end day makes this the last", () => {
    const plan = planAdvance(
      weeklyEnding({ kind: "until", day: day(2026, 10, 18) }),
      dueMonday,
      [],
      completion,
    );
    expect(plan).toMatchObject({
      last: true,
      changes: { status: "done" },
      recurrence: null,
    });
  });
});
