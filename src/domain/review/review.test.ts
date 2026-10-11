import { describe, expect, it } from "vitest";
import {
  isDueForReview,
  nextReviewDay,
  planMarkReviewed,
  planSetReview,
  type ReviewPlan,
} from "./review";

const day = (year: number, month: number, d: number) => ({
  year,
  month,
  day: d,
});

describe("next review day (GLOSSARY: 回顾周期)", () => {
  it("is the last reviewed day plus every N days", () => {
    expect(
      nextReviewDay({
        interval: { every: 3, unit: "day" },
        lastReviewed: day(2026, 10, 30),
        reviewOn: null,
      }),
    ).toEqual(day(2026, 11, 2));
  });

  it("is the last reviewed day plus every N weeks", () => {
    expect(
      nextReviewDay({
        interval: { every: 2, unit: "week" },
        lastReviewed: day(2026, 12, 25),
        reviewOn: null,
      }),
    ).toEqual(day(2027, 1, 8));
  });

  it("is the same day of the month N months after the last reviewed day", () => {
    expect(
      nextReviewDay({
        interval: { every: 3, unit: "month" },
        lastReviewed: day(2026, 11, 15),
        reviewOn: null,
      }),
    ).toEqual(day(2027, 2, 15));
  });

  it.each([
    ["a common year", 2027, day(2027, 2, 28)],
    ["a leap year", 2028, day(2028, 2, 29)],
  ])(
    "takes the last day of a month without that day: January 31 to February, %s",
    (_, year, expected) => {
      expect(
        nextReviewDay({
          interval: { every: 1, unit: "month" },
          lastReviewed: day(year, 1, 31),
          reviewOn: null,
        }),
      ).toEqual(expected);
    },
  );

  it("is none without a review interval or a last reviewed day", () => {
    expect(
      nextReviewDay({
        interval: null,
        lastReviewed: day(2026, 10, 1),
        reviewOn: null,
      }),
    ).toBeNull();
    expect(
      nextReviewDay({
        interval: { every: 1, unit: "week" },
        lastReviewed: null,
        reviewOn: null,
      }),
    ).toBeNull();
  });
});

describe("due for review (GLOSSARY: 需要回顾)", () => {
  const today = day(2026, 10, 14);
  const weekly = { every: 1, unit: "week" } as const;
  const plan = (review: Partial<ReviewPlan>) => ({
    kind: "plan" as const,
    plan: { interval: null, lastReviewed: null, reviewOn: null, ...review },
  });

  it("is due once a whole review interval has passed since the last review", () => {
    const review = plan({ interval: weekly, lastReviewed: day(2026, 10, 7) });
    expect(isDueForReview({ status: "todo", review }, today)).toBe(true);
  });

  it("is due on its review-on day", () => {
    const review = plan({ reviewOn: today });
    expect(isDueForReview({ status: "todo", review }, today)).toBe(true);
  });

  it("is due on a review-on day in the past", () => {
    const review = plan({ reviewOn: day(2026, 9, 1) });
    expect(isDueForReview({ status: "todo", review }, today)).toBe(true);
  });

  it.each([
    [
      "the review-on day comes first",
      { lastReviewed: day(2026, 10, 10), reviewOn: day(2026, 10, 14) },
    ],
    [
      "the interval comes round first",
      { lastReviewed: day(2026, 10, 7), reviewOn: day(2026, 10, 20) },
    ],
  ])("with both, whichever comes first makes it due: %s", (_, days) => {
    const review = plan({ interval: weekly, ...days });
    expect(isDueForReview({ status: "todo", review }, today)).toBe(true);
  });

  it("is not due before either comes", () => {
    const review = plan({
      interval: weekly,
      lastReviewed: day(2026, 10, 8),
      reviewOn: day(2026, 10, 15),
    });
    expect(isDueForReview({ status: "todo", review }, today)).toBe(false);
  });

  it("is never due without a review plan", () => {
    expect(
      isDueForReview({ status: "todo", review: { kind: "none" } }, today),
    ).toBe(false);
  });

  it("a done task is never due", () => {
    const review = plan({ reviewOn: today });
    expect(isDueForReview({ status: "done", review }, today)).toBe(false);
  });

  // Whether a task is in an on-hold subtree is not asked: its own status
  // alone decides, so tasks there are due as any other.
  it.each(["inbox", "todo", "doing", "waiting", "someday"] as const)(
    "a task %s is due as usual",
    (status) => {
      const review = plan({ reviewOn: today });
      expect(isDueForReview({ status, review }, today)).toBe(true);
    },
  );
});

describe("setting a review plan (GLOSSARY: 回顾周期, 指定回顾日)", () => {
  const today = day(2026, 10, 14);
  const weekly = { every: 1, unit: "week" } as const;
  const monthly = { every: 1, unit: "month" } as const;

  it("a new review interval counts today as reviewed", () => {
    expect(
      planSetReview(
        { kind: "none" },
        { interval: weekly, reviewOn: null },
        today,
      ),
    ).toEqual({ interval: weekly, lastReviewed: today, reviewOn: null });
  });

  const reviewedOct1 = {
    kind: "plan",
    plan: { interval: weekly, lastReviewed: day(2026, 10, 1), reviewOn: null },
  } as const;

  it("changing the review interval does not count as a review", () => {
    expect(
      planSetReview(reviewedOct1, { interval: monthly, reviewOn: null }, today),
    ).toEqual({
      interval: monthly,
      lastReviewed: day(2026, 10, 1),
      reviewOn: null,
    });
  });

  it("removing the review interval keeps the last reviewed day", () => {
    expect(
      planSetReview(reviewedOct1, { interval: null, reviewOn: null }, today),
    ).toEqual({
      interval: null,
      lastReviewed: day(2026, 10, 1),
      reviewOn: null,
    });
  });

  it("setting a review interval again after removing it counts today as reviewed", () => {
    expect(
      planSetReview(
        {
          kind: "plan",
          plan: {
            interval: null,
            lastReviewed: day(2026, 10, 1),
            reviewOn: null,
          },
        },
        { interval: weekly, reviewOn: null },
        today,
      ),
    ).toEqual({ interval: weekly, lastReviewed: today, reviewOn: null });
  });

  it.each([
    ["setting", null, day(2026, 9, 1)],
    ["changing", day(2026, 10, 20), day(2026, 11, 1)],
    ["removing", day(2026, 10, 20), null],
  ])(
    "%s the review-on day leaves the last reviewed day as it is",
    (_, before, after) => {
      expect(
        planSetReview(
          { kind: "plan", plan: { ...reviewedOct1.plan, reviewOn: before } },
          { interval: weekly, reviewOn: after },
          today,
        ),
      ).toEqual({
        interval: weekly,
        lastReviewed: day(2026, 10, 1),
        reviewOn: after,
      });
    },
  );

  it("a review-on day alone sets no last reviewed day", () => {
    expect(
      planSetReview(
        { kind: "none" },
        { interval: null, reviewOn: day(2026, 9, 1) },
        today,
      ),
    ).toEqual({
      interval: null,
      lastReviewed: null,
      reviewOn: day(2026, 9, 1),
    });
  });
});

describe("marking reviewed (GLOSSARY: 标记已回顾)", () => {
  const today = day(2026, 10, 14);
  const weekly = { every: 1, unit: "week" } as const;

  it("records today as the last reviewed day and clears the review-on day", () => {
    expect(
      planMarkReviewed(
        {
          status: "todo",
          review: {
            kind: "plan",
            plan: {
              interval: weekly,
              lastReviewed: day(2026, 10, 1),
              reviewOn: day(2026, 10, 10),
            },
          },
        },
        today,
      ),
    ).toEqual({
      kind: "markable",
      plan: { interval: weekly, lastReviewed: today, reviewOn: null },
    });
  });

  it("a task not yet due can be marked early", () => {
    expect(
      planMarkReviewed(
        {
          status: "waiting",
          review: {
            kind: "plan",
            plan: {
              interval: weekly,
              lastReviewed: day(2026, 10, 12),
              reviewOn: null,
            },
          },
        },
        today,
      ),
    ).toEqual({
      kind: "markable",
      plan: { interval: weekly, lastReviewed: today, reviewOn: null },
    });
  });

  it("a review-on day alone can be marked, which clears it", () => {
    expect(
      planMarkReviewed(
        {
          status: "someday",
          review: {
            kind: "plan",
            plan: {
              interval: null,
              lastReviewed: null,
              reviewOn: day(2026, 10, 20),
            },
          },
        },
        today,
      ),
    ).toEqual({
      kind: "markable",
      plan: { interval: null, lastReviewed: today, reviewOn: null },
    });
  });

  it.each([
    ["no review plan", { kind: "none" }],
    [
      "neither a review interval nor a review-on day",
      {
        kind: "plan",
        plan: {
          interval: null,
          lastReviewed: day(2026, 10, 1),
          reviewOn: null,
        },
      },
    ],
  ] as const)("a task with %s cannot be marked", (_, review) => {
    expect(planMarkReviewed({ status: "todo", review }, today)).toEqual({
      kind: "refused",
      reason: "no-plan",
    });
  });

  it("a done task cannot be marked", () => {
    expect(
      planMarkReviewed(
        {
          status: "done",
          review: {
            kind: "plan",
            plan: { interval: weekly, lastReviewed: null, reviewOn: null },
          },
        },
        today,
      ),
    ).toEqual({ kind: "refused", reason: "done" });
  });
});

describe("next review day on a review placement (GLOSSARY: 回顾周期)", () => {
  // October 12, 2026 is a Monday.
  const next = (
    interval: NonNullable<ReviewPlan["interval"]>,
    lastReviewed: ReturnType<typeof day>,
  ) => nextReviewDay({ interval, lastReviewed, reviewOn: null });
  const on = (...days: (1 | 2 | 3 | 4 | 5 | 6 | 7)[]) =>
    ({ kind: "daysOfWeek", days }) as const;

  it("set on a Monday to every Thursday, is the Thursday of that week", () => {
    expect(
      next({ every: 1, unit: "week", placement: on(4) }, day(2026, 10, 12)),
    ).toEqual(day(2026, 10, 15));
  });

  it("marked a day late, on Friday, is still the next Thursday: the days do not drift", () => {
    expect(
      next({ every: 1, unit: "week", placement: on(4) }, day(2026, 10, 16)),
    ).toEqual(day(2026, 10, 22));
  });

  it("is strictly after the last reviewed day: reviewed on a Thursday, it is the next Thursday", () => {
    expect(
      next({ every: 1, unit: "week", placement: on(4) }, day(2026, 10, 15)),
    ).toEqual(day(2026, 10, 22));
  });

  it("on some days of the week, is the next of them in the same week, then across weeks", () => {
    const mondayAndThursday = {
      every: 1,
      unit: "week",
      placement: on(1, 4),
    } as const;
    // Tuesday October 13: Thursday the 15th of that week.
    expect(next(mondayAndThursday, day(2026, 10, 13))).toEqual(
      day(2026, 10, 15),
    );
    // Thursday October 15: Monday the 19th of the next week.
    expect(next(mondayAndThursday, day(2026, 10, 15))).toEqual(
      day(2026, 10, 19),
    );
  });

  it("every 2 weeks on Thursday, set on a Monday, is that Thursday, then every other one", () => {
    const fortnightly = { every: 2, unit: "week", placement: on(4) } as const;
    expect(next(fortnightly, day(2026, 10, 12))).toEqual(day(2026, 10, 15));
    expect(next(fortnightly, day(2026, 10, 15))).toEqual(day(2026, 10, 29));
  });

  it("on a day of the month, is that day of the same month when still to come, else of the next", () => {
    const on20th = {
      every: 1,
      unit: "month",
      placement: { kind: "dayOfMonth", day: 20 },
    } as const;
    expect(next(on20th, day(2026, 10, 12))).toEqual(day(2026, 10, 20));
    expect(next(on20th, day(2026, 10, 20))).toEqual(day(2026, 11, 20));
  });

  it("on the 31st, skips the months without one", () => {
    const on31st = {
      every: 1,
      unit: "month",
      placement: { kind: "dayOfMonth", day: 31 },
    } as const;
    // January 31, 2027: February and its 28 days are skipped.
    expect(next(on31st, day(2027, 1, 31))).toEqual(day(2027, 3, 31));
  });

  it("on the last day of the month, lands in every month", () => {
    const lastDay = {
      every: 1,
      unit: "month",
      placement: { kind: "lastDayOfMonth" },
    } as const;
    expect(next(lastDay, day(2027, 1, 31))).toEqual(day(2027, 2, 28));
    expect(next(lastDay, day(2028, 1, 31))).toEqual(day(2028, 2, 29));
  });

  it.each([
    // Friday October 30: the 31st is a Saturday.
    ["a Saturday", day(2026, 10, 12), day(2026, 10, 30)],
    // Friday May 29: the 31st is a Sunday.
    ["a Sunday", day(2026, 5, 1), day(2026, 5, 29)],
    // Monday August 31.
    ["a weekday", day(2026, 8, 1), day(2026, 8, 31)],
  ])(
    "on the last weekday of the month, when the month ends on %s",
    (_, lastReviewed, expected) => {
      expect(
        next(
          {
            every: 1,
            unit: "month",
            placement: { kind: "lastWeekdayOfMonth" },
          },
          lastReviewed,
        ),
      ).toEqual(expected);
    },
  );

  it("on the last weekday of the month, reviewed on it, is that of the next month", () => {
    expect(
      next(
        { every: 1, unit: "month", placement: { kind: "lastWeekdayOfMonth" } },
        day(2026, 10, 30),
      ),
    ).toEqual(day(2026, 11, 30));
  });

  it("every 3 months on the 15th, counts from the month of the last review", () => {
    const quarterly = {
      every: 3,
      unit: "month",
      placement: { kind: "dayOfMonth", day: 15 },
    } as const;
    // Before the 15th: that month's.
    expect(next(quarterly, day(2026, 10, 12))).toEqual(day(2026, 10, 15));
    // After it: three months on.
    expect(next(quarterly, day(2026, 10, 16))).toEqual(day(2027, 1, 15));
  });

  it("without a placement, keeps counting one whole interval from the last review", () => {
    expect(next({ every: 1, unit: "week" }, day(2026, 10, 16))).toEqual(
      day(2026, 10, 23),
    );
    expect(next({ every: 1, unit: "month" }, day(2027, 1, 31))).toEqual(
      day(2027, 2, 28),
    );
  });
});
