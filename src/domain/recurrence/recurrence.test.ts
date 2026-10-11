import { describe, expect, it } from "vitest";
import {
  countsFrom,
  isStuckDone,
  nextOccurrence,
  planAdvance,
  planRepair,
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
