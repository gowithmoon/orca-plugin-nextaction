import { describe, expect, it } from "vitest";
import {
  countsFrom,
  isStuckDone,
  nextOccurrence,
  planAdvance,
  planRepair,
  planResume,
  recurs,
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
          placement: { kind: "dayOfMonth", day: 20 },
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
          placement: { kind: "dayOfMonth", day: 31 },
        },
        day(2026, 10, 31),
      ),
    ).toEqual(day(2026, 12, 31));
  });

  it("every month on the last day falls on February 28, and on February 29 in a leap year", () => {
    const lastDay = {
      interval: 1,
      unit: "month",
      placement: { kind: "lastDayOfMonth" },
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
      placement: { kind: "weekdayOfMonth", ordinal: 2, weekday: 2 },
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
      placement: { kind: "weekdayOfMonth", ordinal: "last", weekday: 5 },
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
          placement: { kind: "weekdayOfMonth", ordinal: 5, weekday: 5 },
        },
        day(2026, 10, 30),
      ),
    ).toEqual(day(2027, 1, 29));
  });

  it("every year on a month and day takes it later in the same year, else the next", () => {
    const march15 = {
      interval: 1,
      unit: "year",
      placement: { kind: "dayOfYear", month: 3, day: 15 },
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
          placement: { kind: "dayOfYear", month: 2, day: 29 },
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
          placement: { kind: "weekdayOfMonth", ordinal: "last", weekday: 5 },
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

describe("a recurring task stuck in done", () => {
  const rule = {
    period: { interval: 1, unit: "week" },
    basis: "schedule",
  } as const;

  it("is a done task with a rule", () => {
    expect(
      isStuckDone({ status: "done", recurrence: { kind: "rule", rule } }),
    ).toBe(true);
  });

  it("is not a done task without a rule", () => {
    expect(isStuckDone({ status: "done", recurrence: { kind: "none" } })).toBe(
      false,
    );
  });

  it("is not a done task whose rule cannot be read", () => {
    expect(
      isStuckDone({
        status: "done",
        recurrence: { kind: "unreadable", reason: "unknown version 2" },
      }),
    ).toBe(false);
  });

  it.each(["inbox", "todo", "doing", "waiting", "someday"] as const)(
    "is not a %s task with a rule",
    (status) => {
      expect(isStuckDone({ status, recurrence: { kind: "rule", rule } })).toBe(
        false,
      );
    },
  );
});

describe("advancing a recurring task stuck in done (repairing it)", () => {
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

  it("a done task whose rule is paused is not stuck in done: it is done like a plain task", () => {
    expect(isStuckDone({ status: "done", recurrence: paused })).toBe(false);
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
