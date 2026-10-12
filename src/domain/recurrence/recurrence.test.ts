import { describe, expect, it } from "vitest";
import {
  countEnd,
  countsFrom,
  isLastOccurrence,
  isNotAdvanced,
  isResume,
  nextOccurrence,
  planAdvance,
  planRepair,
  planResume,
  planSkip,
  type RecurrenceRule,
  recurs,
  skippable,
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

describe("next occurrence on a placement (#88)", () => {
  // Days of the week are numbered from Monday (1) to Sunday (7).
  const monWedFri = { kind: "daysOfWeek", days: [1, 3, 5] } as const;

  it("every week on some days takes the next of them in the same week", () => {
    // Monday 2026-10-12 → Wednesday 2026-10-14.
    expect(
      nextOccurrence(
        { interval: 1, unit: "week", placement: monWedFri },
        day(2026, 10, 12),
      ),
    ).toEqual(day(2026, 10, 14));
  });

  it("every week on some days goes on to the first of them next week after the last", () => {
    // Friday 2026-10-16 → Monday 2026-10-19.
    expect(
      nextOccurrence(
        { interval: 1, unit: "week", placement: monWedFri },
        day(2026, 10, 16),
      ),
    ).toEqual(day(2026, 10, 19));
  });

  it("every 2 weeks on some days skips the week between", () => {
    // Friday 2026-10-16 → Monday 2026-10-26; Wednesday 2026-10-14 → Friday 16.
    const everyTwoWeeks = {
      interval: 2,
      unit: "week",
      placement: monWedFri,
    } as const;
    expect(nextOccurrence(everyTwoWeeks, day(2026, 10, 16))).toEqual(
      day(2026, 10, 26),
    );
    expect(nextOccurrence(everyTwoWeeks, day(2026, 10, 14))).toEqual(
      day(2026, 10, 16),
    );
  });

  it("every week on a day counts from a day that is not one of them, e.g. a Sunday", () => {
    // Sunday 2026-10-18 belongs to the week of Monday 12: next is Monday 19.
    expect(
      nextOccurrence(
        { interval: 1, unit: "week", placement: monWedFri },
        day(2026, 10, 18),
      ),
    ).toEqual(day(2026, 10, 19));
  });

  it("every month on a day of the month takes it later in the same month", () => {
    expect(
      nextOccurrence(
        {
          interval: 1,
          unit: "month",
          placement: { kind: "daysOfMonth", days: [20] },
        },
        day(2026, 10, 12),
      ),
    ).toEqual(day(2026, 10, 20));
  });

  it("every month on a day of the month skips months without it: the 31st after October 31 is December 31", () => {
    expect(
      nextOccurrence(
        {
          interval: 1,
          unit: "month",
          placement: { kind: "daysOfMonth", days: [31] },
        },
        day(2026, 10, 31),
      ),
    ).toEqual(day(2026, 12, 31));
  });

  it("every month on some days of the month takes the next of them, then the first of them next month", () => {
    const firstAndFifteenth = {
      interval: 1,
      unit: "month",
      placement: { kind: "daysOfMonth", days: [1, 15] },
    } as const;
    expect(nextOccurrence(firstAndFifteenth, day(2026, 10, 1))).toEqual(
      day(2026, 10, 15),
    );
    expect(nextOccurrence(firstAndFifteenth, day(2026, 10, 15))).toEqual(
      day(2026, 11, 1),
    );
  });

  it("every 2 months on some days skips the month between", () => {
    expect(
      nextOccurrence(
        {
          interval: 2,
          unit: "month",
          placement: { kind: "daysOfMonth", days: [1, 15] },
        },
        day(2026, 10, 15),
      ),
    ).toEqual(day(2026, 12, 1));
  });

  it("every month on the 30th and the last day takes the last day in February, which has no 30th", () => {
    const thirtiethAndLast = {
      interval: 1,
      unit: "month",
      placement: { kind: "daysOfMonth", days: [30, "last"] },
    } as const;
    expect(nextOccurrence(thirtiethAndLast, day(2027, 1, 31))).toEqual(
      day(2027, 2, 28),
    );
    // In a month of 30 days the two are one day.
    expect(nextOccurrence(thirtiethAndLast, day(2026, 11, 30))).toEqual(
      day(2026, 12, 30),
    );
  });

  it("every month on the second and fourth Tuesday takes the next of them", () => {
    const secondAndFourthTuesday = {
      interval: 1,
      unit: "month",
      placement: {
        kind: "weekdaysOfMonth",
        weekdays: [
          { ordinal: 2, weekday: 2 },
          { ordinal: 4, weekday: 2 },
        ],
      },
    } as const;
    // October 2026's Tuesdays: 6, 13, 20, 27; November's: 3, 10, 17, 24.
    expect(nextOccurrence(secondAndFourthTuesday, day(2026, 10, 13))).toEqual(
      day(2026, 10, 27),
    );
    expect(nextOccurrence(secondAndFourthTuesday, day(2026, 10, 27))).toEqual(
      day(2026, 11, 10),
    );
  });

  it("every month on some days of the week leaves out the ones a month does not have", () => {
    // November 2026 has four Fridays: its fifth is left out, its first kept.
    expect(
      nextOccurrence(
        {
          interval: 1,
          unit: "month",
          placement: {
            kind: "weekdaysOfMonth",
            weekdays: [
              { ordinal: 1, weekday: 5 },
              { ordinal: 5, weekday: 5 },
            ],
          },
        },
        day(2026, 11, 6),
      ),
    ).toEqual(day(2026, 12, 4));
  });

  it("every month on the last day falls on February 28, and on February 29 in a leap year", () => {
    const lastDay = {
      interval: 1,
      unit: "month",
      placement: { kind: "daysOfMonth", days: ["last"] },
    } as const;
    expect(nextOccurrence(lastDay, day(2027, 1, 31))).toEqual(day(2027, 2, 28));
    expect(nextOccurrence(lastDay, day(2028, 1, 31))).toEqual(day(2028, 2, 29));
    // Counting from mid-month takes the end of that month.
    expect(nextOccurrence(lastDay, day(2026, 11, 3))).toEqual(
      day(2026, 11, 30),
    );
  });

  it("every month on the second Tuesday", () => {
    const secondTuesday = {
      interval: 1,
      unit: "month",
      placement: {
        kind: "weekdaysOfMonth",
        weekdays: [{ ordinal: 2, weekday: 2 }],
      },
    } as const;
    // October 2026's Tuesdays: 6, 13, 20, 27; November's: 3, 10, 17, 24.
    expect(nextOccurrence(secondTuesday, day(2026, 10, 12))).toEqual(
      day(2026, 10, 13),
    );
    expect(nextOccurrence(secondTuesday, day(2026, 10, 13))).toEqual(
      day(2026, 11, 10),
    );
  });

  it("every month on the last Friday", () => {
    const lastFriday = {
      interval: 1,
      unit: "month",
      placement: {
        kind: "weekdaysOfMonth",
        weekdays: [{ ordinal: "last", weekday: 5 }],
      },
    } as const;
    // October 2026 has five Fridays (the last October 30), November four
    // (the last November 27).
    expect(nextOccurrence(lastFriday, day(2026, 10, 12))).toEqual(
      day(2026, 10, 30),
    );
    expect(nextOccurrence(lastFriday, day(2026, 10, 30))).toEqual(
      day(2026, 11, 27),
    );
  });

  it("every month on the fifth Friday skips months with only four", () => {
    // After October 30, 2026: November and December have four Fridays;
    // January 2027 has five (1, 8, 15, 22, 29).
    expect(
      nextOccurrence(
        {
          interval: 1,
          unit: "month",
          placement: {
            kind: "weekdaysOfMonth",
            weekdays: [{ ordinal: 5, weekday: 5 }],
          },
        },
        day(2026, 10, 30),
      ),
    ).toEqual(day(2027, 1, 29));
  });

  it("every year on some months and days takes the next of them, then the first of them next year", () => {
    const marchAndSeptember = {
      interval: 1,
      unit: "year",
      placement: {
        kind: "daysOfYear",
        days: [
          { month: 3, day: 1 },
          { month: 9, day: 1 },
        ],
      },
    } as const;
    expect(nextOccurrence(marchAndSeptember, day(2026, 3, 1))).toEqual(
      day(2026, 9, 1),
    );
    expect(nextOccurrence(marchAndSeptember, day(2026, 10, 12))).toEqual(
      day(2027, 3, 1),
    );
  });

  it("every year on February 29 and another day leaves out February 29 in common years", () => {
    expect(
      nextOccurrence(
        {
          interval: 1,
          unit: "year",
          placement: {
            kind: "daysOfYear",
            days: [
              { month: 2, day: 29 },
              { month: 6, day: 1 },
            ],
          },
        },
        day(2026, 6, 1),
      ),
    ).toEqual(day(2027, 6, 1));
  });

  it("every year on a month and day takes it later in the same year, else the next", () => {
    const march15 = {
      interval: 1,
      unit: "year",
      placement: { kind: "daysOfYear", days: [{ month: 3, day: 15 }] },
    } as const;
    expect(nextOccurrence(march15, day(2026, 1, 10))).toEqual(day(2026, 3, 15));
    expect(nextOccurrence(march15, day(2026, 10, 12))).toEqual(
      day(2027, 3, 15),
    );
  });

  it("every year on February 29 skips years without it", () => {
    expect(
      nextOccurrence(
        {
          interval: 1,
          unit: "year",
          placement: { kind: "daysOfYear", days: [{ month: 2, day: 29 }] },
        },
        day(2026, 10, 12),
      ),
    ).toEqual(day(2028, 2, 29));
  });

  it("every N weekdays counts N Mondays to Fridays on, skipping the weekend", () => {
    // Thursday 2026-10-15 + 2 weekdays: Friday 16, Monday 19.
    expect(
      nextOccurrence({ interval: 2, unit: "weekday" }, day(2026, 10, 15)),
    ).toEqual(day(2026, 10, 19));
    // Friday 2026-10-16 + 1 weekday: Monday 19.
    expect(
      nextOccurrence({ interval: 1, unit: "weekday" }, day(2026, 10, 16)),
    ).toEqual(day(2026, 10, 19));
  });

  it("every N weekdays from a weekend day counts from the Monday after", () => {
    // Saturday 2026-10-17 + 1 weekday: Monday 19; + 3: Wednesday 21.
    expect(
      nextOccurrence({ interval: 1, unit: "weekday" }, day(2026, 10, 17)),
    ).toEqual(day(2026, 10, 19));
    expect(
      nextOccurrence({ interval: 3, unit: "weekday" }, day(2026, 10, 18)),
    ).toEqual(day(2026, 10, 21));
  });
});

describe("advancing onto a placement, on either basis (#88)", () => {
  const everyMonday = {
    interval: 1,
    unit: "week",
    placement: { kind: "daysOfWeek", days: [1] },
  } as const;
  // Completed on Wednesday 2026-10-14.
  const completion = {
    at: new Date("2026-10-14T01:00:00.000Z"),
    day: day(2026, 10, 14),
  };

  it("every Monday on a fixed schedule, overdue from Monday September 28, falls on Monday October 5", () => {
    const plan = planAdvance(
      { period: everyMonday, basis: "schedule" },
      { status: "todo", start: null, due: day(2026, 9, 28) },
      [],
      completion,
    );
    expect(plan.next).toEqual(day(2026, 10, 5));
  });

  it("every Monday after completion falls on the Monday after the completion", () => {
    const plan = planAdvance(
      { period: everyMonday, basis: "completion" },
      { status: "todo", start: null, due: day(2026, 9, 28) },
      [],
      completion,
    );
    expect(plan.changes).toEqual({ status: "todo", due: day(2026, 10, 19) });
  });

  it("the last Friday of each month after completion keeps the start three days before", () => {
    const plan = planAdvance(
      {
        period: {
          interval: 1,
          unit: "month",
          placement: {
            kind: "weekdaysOfMonth",
            weekdays: [{ ordinal: "last", weekday: 5 }],
          },
        },
        basis: "completion",
      },
      { status: "doing", start: day(2026, 9, 22), due: day(2026, 9, 25) },
      [],
      completion,
    );
    expect(plan.changes).toEqual({
      status: "todo",
      start: day(2026, 10, 27),
      due: day(2026, 10, 30),
    });
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
    expect(plan).toMatchObject({ next: day(2026, 10, 19) });
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
      changes: { status: "done" },
      recurrence: null,
    });
  });
});

describe("a recurring task not advanced (未自动重复)", () => {
  const rule = {
    period: { interval: 1, unit: "week" },
    basis: "schedule",
  } as const;

  it("is a done task with a rule", () => {
    expect(
      isNotAdvanced({ status: "done", recurrence: { kind: "rule", rule } }),
    ).toBe(true);
  });

  it("is not a done task without a rule", () => {
    expect(
      isNotAdvanced({ status: "done", recurrence: { kind: "none" } }),
    ).toBe(false);
  });

  it("is not a done task whose rule cannot be read", () => {
    expect(
      isNotAdvanced({
        status: "done",
        recurrence: { kind: "unreadable", reason: "unknown version 2" },
      }),
    ).toBe(false);
  });

  it.each(["inbox", "todo", "doing", "waiting", "someday"] as const)(
    "is not a %s task with a rule",
    (status) => {
      expect(
        isNotAdvanced({ status, recurrence: { kind: "rule", rule } }),
      ).toBe(false);
    },
  );
});

describe("advancing a recurring task not advanced (repairing it)", () => {
  // Repaired on Wednesday October 14; Orca had it marked done earlier.
  const repair = {
    at: new Date("2026-10-14T01:00:00.000Z"),
    day: day(2026, 10, 14),
  };

  it("after completion, counts from the day it is repaired, not from its dates", () => {
    const plan = planRepair(
      { period: { interval: 3, unit: "day" }, basis: "completion" },
      { status: "done", start: null, due: day(2026, 10, 5) },
      repair,
    );
    expect(plan.changes).toEqual({ status: "todo", due: day(2026, 10, 17) });
    expect(plan.next).toEqual(day(2026, 10, 17));
  });

  it("on a fixed schedule, counts from the task's current date", () => {
    // Due Monday October 12, every week: next is Monday October 19.
    const plan = planRepair(
      { period: { interval: 1, unit: "week" }, basis: "schedule" },
      { status: "done", start: day(2026, 10, 9), due: day(2026, 10, 12) },
      repair,
    );
    expect(plan.changes).toEqual({
      status: "todo",
      start: day(2026, 10, 16),
      due: day(2026, 10, 19),
    });
  });

  it("on a fixed schedule without dates, counts from the day it is repaired", () => {
    const plan = planRepair(
      { period: { interval: 1, unit: "week" }, basis: "schedule" },
      { status: "done", start: null, due: null },
      repair,
    );
    expect(plan.changes).toEqual({ status: "todo", start: day(2026, 10, 21) });
  });

  it("records nothing: the plan holds no completion history to write", () => {
    const plan = planRepair(
      { period: { interval: 1, unit: "week" }, basis: "completion" },
      { status: "done", start: null, due: null },
      repair,
    );
    expect(plan).not.toHaveProperty("history");
  });
});

describe("pausing and resuming the rule (#92)", () => {
  const weekly = {
    period: { interval: 1, unit: "week" },
    basis: "schedule",
  } as const;
  const paused = { kind: "rule", rule: { ...weekly, paused: true } } as const;

  it("a task whose rule is paused is not a recurring task", () => {
    expect(recurs(paused)).toBe(false);
  });

  it("a done task whose rule is paused is not a task not advanced: it is done like a plain task", () => {
    expect(isNotAdvanced({ status: "done", recurrence: paused })).toBe(false);
  });

  // Resumed on Wednesday October 14, back from a trip.
  const resume = {
    at: new Date("2026-10-14T01:00:00.000Z"),
    day: day(2026, 10, 14),
  };
  const everyThreeDaysAfterCompletion = {
    period: { interval: 3, unit: "day" },
    basis: "completion",
  } as const;

  it("resuming a done task after completion advances it from the last completion, recording nothing", () => {
    const history = [
      { at: new Date("2026-09-01T01:00:00.000Z"), day: day(2026, 9, 1) },
      { at: new Date("2026-09-20T01:00:00.000Z"), day: day(2026, 9, 20) },
    ];
    const plan = planResume(
      everyThreeDaysAfterCompletion,
      { status: "done", start: null, due: day(2026, 9, 18) },
      history,
      resume,
    );
    expect(plan).toEqual({
      changes: { status: "todo", due: day(2026, 9, 23) },
      next: day(2026, 9, 23),
    });
  });

  it("resuming a done task after completion without a completion recorded counts from the day it is resumed", () => {
    const plan = planResume(
      everyThreeDaysAfterCompletion,
      { status: "done", start: null, due: day(2026, 9, 18) },
      [],
      resume,
    );
    expect(plan.next).toEqual(day(2026, 10, 17));
  });

  it("resuming a done task on a fixed schedule counts from its current date, not the completion", () => {
    // Due Monday October 12, every week: next is Monday October 19.
    const plan = planResume(
      weekly,
      { status: "done", start: null, due: day(2026, 10, 12) },
      [{ at: new Date("2026-09-20T01:00:00.000Z"), day: day(2026, 9, 20) }],
      resume,
    );
    expect(plan.changes).toEqual({ status: "todo", due: day(2026, 10, 19) });
  });

  it("resuming a done task on a fixed schedule without dates counts from the day it is resumed", () => {
    const plan = planResume(
      weekly,
      { status: "done", start: null, due: null },
      [{ at: new Date("2026-09-20T01:00:00.000Z"), day: day(2026, 9, 20) }],
      resume,
    );
    expect(plan.changes).toEqual({ status: "todo", start: day(2026, 10, 21) });
  });
});

describe("skipping an occurrence (#91)", () => {
  // Skipped on Wednesday October 14.
  const skip = {
    at: new Date("2026-10-14T01:00:00.000Z"),
    day: day(2026, 10, 14),
  };
  const weekly = {
    period: { interval: 1, unit: "week" },
    basis: "schedule",
  } as const;
  const earlier = {
    at: new Date("2026-10-07T01:00:00.000Z"),
    day: day(2026, 10, 7),
  };

  it("records a skip after the entries already recorded", () => {
    const plan = planSkip(
      weekly,
      { status: "todo", start: null, due: day(2026, 10, 12) },
      [earlier],
      skip,
    );
    expect(plan.history).toEqual([earlier, { ...skip, kind: "skip" }]);
  });

  it("goes back to todo from any status not done, the dates moved to the next occurrence", () => {
    for (const status of [
      "inbox",
      "todo",
      "doing",
      "waiting",
      "someday",
    ] as const) {
      const plan = planSkip(
        weekly,
        { status, start: day(2026, 10, 9), due: day(2026, 10, 12) },
        [],
        skip,
      );
      expect(plan).toMatchObject({
        next: day(2026, 10, 19),
        changes: {
          status: "todo",
          start: day(2026, 10, 16),
          due: day(2026, 10, 19),
        },
      });
    }
  });

  it("after completion counts from the day it is skipped", () => {
    const plan = planSkip(
      { period: { interval: 3, unit: "month" }, basis: "completion" },
      { status: "todo", start: null, due: day(2026, 9, 1) },
      [],
      skip,
    );
    expect(plan.next).toEqual(day(2027, 1, 14));
  });

  it("uses up one of the remaining occurrences", () => {
    const plan = planSkip(
      { ...weekly, end: { kind: "count", total: 5, remaining: 3 } },
      { status: "todo", start: null, due: day(2026, 10, 12) },
      [],
      skip,
    );
    expect(plan.recurrence).toEqual({
      ...weekly,
      end: { kind: "count", total: 5, remaining: 2 },
    });
  });

  it("resuming a done task after completion counts from the last completion, not a later skip", () => {
    const completedSep20 = {
      at: new Date("2026-09-20T01:00:00.000Z"),
      day: day(2026, 9, 20),
    };
    const skippedOct1 = {
      at: new Date("2026-10-01T01:00:00.000Z"),
      day: day(2026, 10, 1),
      kind: "skip" as const,
    };
    const plan = planResume(
      { period: { interval: 3, unit: "day" }, basis: "completion" },
      { status: "done", start: null, due: day(2026, 9, 18) },
      [completedSep20, skippedOct1],
      skip,
    );
    expect(plan.next).toEqual(day(2026, 9, 23));
  });
});

describe("whether an occurrence can be skipped (#91)", () => {
  const weekly = {
    period: { interval: 1, unit: "week" },
    basis: "schedule",
  } as const;
  // Skipped on Wednesday October 14; due Monday October 12.
  const today = day(2026, 10, 14);
  const due = day(2026, 10, 12);

  it.each(["inbox", "todo", "doing", "waiting", "someday"] as const)(
    "a %s recurring task can be skipped, with its rule",
    (status) => {
      expect(
        skippable(
          {
            status,
            start: null,
            due,
            recurrence: { kind: "rule", rule: weekly },
          },
          today,
        ),
      ).toEqual({ kind: "skippable", rule: weekly });
    },
  );

  it.each([
    ["without a rule", "todo", { kind: "none" }, "not-recurring"],
    [
      "whose rule cannot be read",
      "todo",
      { kind: "unreadable", reason: "unknown version 2" },
      "not-recurring",
    ],
    [
      "whose rule is paused",
      "todo",
      { kind: "rule", rule: { ...weekly, paused: true } },
      "paused",
    ],
    ["that is done", "done", { kind: "rule", rule: weekly }, "done"],
    [
      "on its last occurrence",
      "todo",
      {
        kind: "rule",
        rule: { ...weekly, end: { kind: "count", total: 5, remaining: 1 } },
      },
      "last",
    ],
  ] as const)(
    "a task %s cannot be skipped",
    (_, status, recurrence, reason) => {
      expect(
        skippable({ status, start: null, due, recurrence }, today),
      ).toEqual({ kind: "refused", reason });
    },
  );
});

describe("whether writing a rule resumes it (#92)", () => {
  const weekly = {
    period: { interval: 1, unit: "week" },
    basis: "schedule",
  } as const;
  const paused = { kind: "rule", rule: { ...weekly, paused: true } } as const;

  it("writing a rule that applies over a done task's paused rule resumes it", () => {
    expect(isResume({ status: "done", recurrence: paused }, weekly)).toBe(true);
  });

  it.each([
    ["the task is not done", "todo", paused, weekly],
    ["its rule is not paused", "done", { kind: "rule", rule: weekly }, weekly],
    ["it has no rule", "done", { kind: "none" }, weekly],
    ["the rule written is still paused", "done", paused, paused.rule],
    ["the rule is removed", "done", paused, null],
  ] as const)("is no resume when %s", (_, status, recurrence, rule) => {
    expect(isResume({ status, recurrence }, rule)).toBe(false);
  });
});
