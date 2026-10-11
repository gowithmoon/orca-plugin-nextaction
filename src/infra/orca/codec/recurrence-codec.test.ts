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
