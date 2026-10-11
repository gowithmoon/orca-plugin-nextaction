import { describe, expect, it } from "vitest";
import type { ReviewPlan } from "../../../domain/review/review";
import { planReviewWrite, readReview } from "./review-codec";

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

describe("readReview and planReviewWrite", () => {
  it("reads back the review plan it writes", () => {
    const plan = {
      interval: { every: 2, unit: "week" },
      lastReviewed: { year: 2026, month: 10, day: 1 },
      reviewOn: { year: 2026, month: 10, day: 20 },
    } as const;
    const write = planReviewWrite(taskBlockWith(), plan);
    if (write.kind !== "write") throw new Error("refused");
    expect(write.property).toEqual({
      name: "nextaction.review",
      type: 0,
      value: {
        v: 1,
        interval: { every: 2, unit: "week" },
        lastReviewed: "2026-10-01",
        reviewOn: "2026-10-20",
      },
    });
    expect(readReview(taskBlockWith(write.property))).toEqual({
      kind: "plan",
      plan,
    });
  });

  it("an empty plan writes no fields, the property kept, and reads back as an empty plan", () => {
    const empty = { interval: null, lastReviewed: null, reviewOn: null };
    const write = planReviewWrite(taskBlockWith(), empty);
    if (write.kind !== "write") throw new Error("refused");
    expect(write.property.value).toEqual({ v: 1 });
    expect(readReview(taskBlockWith(write.property))).toEqual({
      kind: "plan",
      plan: empty,
    });
  });

  it.each([
    [
      "only a review-on day",
      {
        interval: null,
        lastReviewed: null,
        reviewOn: { year: 2026, month: 9, day: 1 },
      },
      { reviewOn: "2026-09-01" },
    ],
    [
      "a last reviewed day without an interval",
      {
        interval: null,
        lastReviewed: { year: 2026, month: 10, day: 1 },
        reviewOn: null,
      },
      { lastReviewed: "2026-10-01" },
    ],
    ...(["day", "week", "month"] as const).map(
      (unit) =>
        [
          `every 3 of unit ${unit}`,
          {
            interval: { every: 3, unit },
            lastReviewed: { year: 2026, month: 10, day: 1 },
            reviewOn: null,
          },
          { interval: { every: 3, unit }, lastReviewed: "2026-10-01" },
        ] as const,
    ),
  ] as [string, ReviewPlan, Record<string, unknown>][])(
    "reads back a plan with %s",
    (_, plan, stored) => {
      const write = planReviewWrite(taskBlockWith(), plan);
      if (write.kind !== "write") throw new Error("refused");
      expect(write.property.value).toEqual({ v: 1, ...stored });
      expect(readReview(taskBlockWith(write.property))).toEqual({
        kind: "plan",
        plan,
      });
    },
  );

  it("reads a task without nextaction.review as no plan", () => {
    expect(readReview(taskBlockWith())).toEqual({ kind: "none" });
  });

  const anyPlan = {
    interval: { every: 1, unit: "week" },
    lastReviewed: null,
    reviewOn: null,
  } as const;

  it.each([
    ["an interval that is not an object", { interval: "weekly" }],
    ["an interval of 0", { interval: { every: 0, unit: "week" } }],
    ["a negative interval", { interval: { every: -2, unit: "day" } }],
    [
      "an interval that is not whole",
      { interval: { every: 1.5, unit: "week" } },
    ],
    ["an interval without a number", { interval: { unit: "week" } }],
    ["an unknown unit", { interval: { every: 1, unit: "year" } }],
    ["a last reviewed day that is not a day", { lastReviewed: "2026-02-30" }],
    ["a last reviewed day not as YYYY-MM-DD", { lastReviewed: "2026/10/01" }],
    ["a review-on day that is not a string", { reviewOn: 20261001 }],
  ])(
    "keeps a value with %s as found, unreadable, and refuses to overwrite it",
    (_, data) => {
      const raw = { v: 1, ...data };
      const block = taskBlockWith({ name: "nextaction.review", value: raw });
      expect(readReview(block)).toMatchObject({ kind: "unreadable", raw });
      expect(planReviewWrite(block, anyPlan).kind).toBe("refused");
    },
  );

  it.each([
    ["an unknown version", { v: 2, interval: { every: 1, unit: "week" } }],
    ["a value that is not an object", "weekly"],
  ])("keeps %s as found, unreadable, and refuses to overwrite it", (_, raw) => {
    const block = taskBlockWith({ name: "nextaction.review", value: raw });
    expect(readReview(block)).toMatchObject({ kind: "unreadable", raw });
    expect(planReviewWrite(block, anyPlan).kind).toBe("refused");
  });
});
