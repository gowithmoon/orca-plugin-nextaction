import { describe, expect, it } from "vitest";
import { planRecurrenceWrite, readRecurrence } from "./recurrence-codec";

// A task block's `properties` as get-blocks returns them: plugin block
// properties are JSON (type 0) next to `_tags` and `_repr`
// (block-properties-json J1, J4).
const taskBlockWith = (...plugin: { name: string; value: unknown }[]) => ({
  properties: [
    { name: "_repr", type: 0, value: { type: "text" } },
    { name: "_tags", type: 0, value: [203] },
    ...plugin.map((p) => ({ ...p, type: 0, pos: null, typeArgs: null })),
  ],
});

const everyTwoWeeks = {
  period: { interval: 2, unit: "week" },
  basis: "schedule",
} as const;

describe("readRecurrence and planRecurrenceWrite", () => {
  it("reads back the rule it writes", () => {
    const plan = planRecurrenceWrite(taskBlockWith(), everyTwoWeeks);
    if (plan.kind !== "write") throw new Error("refused");
    expect(plan.property).toEqual({
      name: "nextaction.recurrence",
      type: 0,
      value: {
        v: 1,
        rule: { period: { interval: 2, unit: "week" }, basis: "schedule" },
      },
    });
    expect(readRecurrence(taskBlockWith(plan.property))).toEqual({
      kind: "rule",
      rule: everyTwoWeeks,
    });
  });

  it("reads a task without nextaction.recurrence as no rule", () => {
    expect(readRecurrence(taskBlockWith())).toEqual({ kind: "none" });
  });

  it("removing the rule writes no rule, the property kept, and reads back as none", () => {
    const block = taskBlockWith({
      name: "nextaction.recurrence",
      value: {
        v: 1,
        rule: { period: { interval: 1, unit: "day" }, basis: "completion" },
      },
    });
    const plan = planRecurrenceWrite(block, null);
    if (plan.kind !== "write") throw new Error("refused");
    expect(plan.property.value).toEqual({ v: 1, rule: null });
    expect(readRecurrence(taskBlockWith(plan.property))).toEqual({
      kind: "none",
    });
  });

  it.each([
    ["no rule field", {}],
    ["a rule that is not an object", { rule: "weekly" }],
    ["no period", { rule: { basis: "schedule" } }],
    ["no interval", { rule: { period: { unit: "week" }, basis: "schedule" } }],
    [
      "an interval of 0",
      { rule: { period: { interval: 0, unit: "week" }, basis: "schedule" } },
    ],
    [
      "an interval that is not whole",
      { rule: { period: { interval: 1.5, unit: "week" }, basis: "schedule" } },
    ],
    [
      "an unknown unit",
      { rule: { period: { interval: 1, unit: "hour" }, basis: "schedule" } },
    ],
    ["no basis", { rule: { period: { interval: 1, unit: "week" } } }],
    [
      "an unknown basis",
      { rule: { period: { interval: 1, unit: "week" }, basis: "random" } },
    ],
  ])(
    "keeps a value with %s as found, unreadable, and refuses to overwrite it",
    (_, data) => {
      const block = taskBlockWith({
        name: "nextaction.recurrence",
        value: { v: 1, ...data },
      });
      expect(readRecurrence(block)).toMatchObject({
        kind: "unreadable",
        raw: { v: 1, ...data },
      });
      expect(planRecurrenceWrite(block, everyTwoWeeks).kind).toBe("refused");
    },
  );

  it("keeps a value of an unknown version as found, and refuses to overwrite it", () => {
    const raw = { v: 2, rule: { cron: "0 0 * * 1" } };
    const block = taskBlockWith({ name: "nextaction.recurrence", value: raw });
    expect(readRecurrence(block)).toEqual({
      kind: "unreadable",
      raw: { v: 2, rule: { cron: "0 0 * * 1" } },
      reason: "unknown version 2",
    });
    expect(planRecurrenceWrite(block, null)).toMatchObject({
      kind: "refused",
      reason: "unknown version 2",
    });
  });
});

describe("pausing the rule (#92)", () => {
  it("reads back a paused rule it writes", () => {
    const paused = { ...everyTwoWeeks, paused: true };
    const plan = planRecurrenceWrite(taskBlockWith(), paused);
    if (plan.kind !== "write") throw new Error("refused");
    expect(plan.property.value).toEqual({
      v: 1,
      rule: {
        period: { interval: 2, unit: "week" },
        basis: "schedule",
        paused: true,
      },
    });
    expect(readRecurrence(taskBlockWith(plan.property))).toEqual({
      kind: "rule",
      rule: paused,
    });
  });

  it("keeps a rule whose paused flag is neither true nor false as found, unreadable", () => {
    const block = taskBlockWith({
      name: "nextaction.recurrence",
      value: { v: 1, rule: { ...everyTwoWeeks, paused: "yes" } },
    });
    expect(readRecurrence(block)).toMatchObject({ kind: "unreadable" });
    expect(planRecurrenceWrite(block, everyTwoWeeks).kind).toBe("refused");
  });
});

describe("placements and weekdays (#88)", () => {
  it.each([
    [
      "some days of the week",
      {
        interval: 2,
        unit: "week",
        placement: { kind: "daysOfWeek", days: [1, 3, 5] },
      },
    ],
    [
      "a day of the month",
      {
        interval: 1,
        unit: "month",
        placement: { kind: "dayOfMonth", day: 31 },
      },
    ],
    [
      "the last day of the month",
      { interval: 1, unit: "month", placement: { kind: "lastDayOfMonth" } },
    ],
    [
      "the second Tuesday of the month",
      {
        interval: 1,
        unit: "month",
        placement: { kind: "weekdayOfMonth", ordinal: 2, weekday: 2 },
      },
    ],
    [
      "the last Friday of the month",
      {
        interval: 1,
        unit: "month",
        placement: { kind: "weekdayOfMonth", ordinal: "last", weekday: 5 },
      },
    ],
    [
      "a month and day of the year",
      {
        interval: 1,
        unit: "year",
        placement: { kind: "dayOfYear", month: 3, day: 15 },
      },
    ],
    ["every N weekdays", { interval: 3, unit: "weekday" }],
  ] as const)("reads back a period on %s as written", (_, period) => {
    const rule = { period, basis: "completion" } as const;
    const plan = planRecurrenceWrite(taskBlockWith(), rule);
    if (plan.kind !== "write") throw new Error("refused");
    expect(readRecurrence(taskBlockWith(plan.property))).toEqual({
      kind: "rule",
      rule,
    });
  });

  it("writes a period without a placement without the field", () => {
    const plan = planRecurrenceWrite(taskBlockWith(), everyTwoWeeks);
    if (plan.kind !== "write") throw new Error("refused");
    expect(plan.property.value).toEqual({
      v: 1,
      rule: { period: { interval: 2, unit: "week" }, basis: "schedule" },
    });
  });

  it.each([
    ["a week with no days", "week", { kind: "daysOfWeek", days: [] }],
    ["a week with day 8", "week", { kind: "daysOfWeek", days: [1, 8] }],
    ["a day of the month of 0", "month", { kind: "dayOfMonth", day: 0 }],
    ["a day of the month of 32", "month", { kind: "dayOfMonth", day: 32 }],
    [
      "a sixth Friday",
      "month",
      { kind: "weekdayOfMonth", ordinal: 6, weekday: 5 },
    ],
    [
      "an ordinal of 0",
      "month",
      { kind: "weekdayOfMonth", ordinal: 0, weekday: 5 },
    ],
    [
      "a weekday of 0",
      "month",
      { kind: "weekdayOfMonth", ordinal: 1, weekday: 0 },
    ],
    ["February 30", "year", { kind: "dayOfYear", month: 2, day: 30 }],
    ["month 13", "year", { kind: "dayOfYear", month: 13, day: 1 }],
    ["a month's placement on a week", "week", { kind: "lastDayOfMonth" }],
    ["a placement on days", "day", { kind: "dayOfMonth", day: 1 }],
    ["a placement on weekdays", "weekday", { kind: "daysOfWeek", days: [1] }],
  ])(
    "keeps a rule with %s as found, unreadable, and refuses to overwrite it",
    (_, unit, placement) => {
      const raw = {
        v: 1,
        rule: { period: { interval: 1, unit, placement }, basis: "schedule" },
      };
      const block = taskBlockWith({
        name: "nextaction.recurrence",
        value: raw,
      });
      expect(readRecurrence(block)).toMatchObject({ kind: "unreadable", raw });
      expect(planRecurrenceWrite(block, everyTwoWeeks).kind).toBe("refused");
    },
  );
});
