import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { ReviewUnreadableError } from "./review-unreadable-error";
import { createSetReviewPlan } from "./set-review-plan";

const weekly = { every: 1, unit: "week" } as const;
const oct1 = { year: 2026, month: 10, day: 1 };
const oct14 = { year: 2026, month: 10, day: 14 };

const deps = (repository: InMemoryTaskRepository) => ({
  repository,
  // Wednesday October 14, 2026, 09:00 in UTC+8.
  clock: createFixedClock("2026-10-14T09:00:00+08:00"),
  dayBoundary: createFixedDayBoundary(),
});

describe("set a task's review plan", () => {
  it("a new review interval is written with today as the last reviewed day", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "todo" });
    await createSetReviewPlan(deps(repository))(1, {
      interval: weekly,
      reviewOn: null,
    });
    expect((await repository.getTask(1))?.review).toEqual({
      kind: "plan",
      plan: { interval: weekly, lastReviewed: oct14, reviewOn: null },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("changing the interval and setting a review-on day keeps the last reviewed day", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      status: "waiting",
      review: {
        kind: "plan",
        plan: { interval: weekly, lastReviewed: oct1, reviewOn: null },
      },
    });
    const monthly = { every: 1, unit: "month" } as const;
    const oct20 = { year: 2026, month: 10, day: 20 };
    await createSetReviewPlan(deps(repository))(1, {
      interval: monthly,
      reviewOn: oct20,
    });
    expect((await repository.getTask(1))?.review).toEqual({
      kind: "plan",
      plan: { interval: monthly, lastReviewed: oct1, reviewOn: oct20 },
    });
  });

  it("refuses a review plan it cannot read, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      status: "todo",
      review: { kind: "unreadable", reason: "unknown version 2" },
    });
    await expect(
      createSetReviewPlan(deps(repository))(1, {
        interval: weekly,
        reviewOn: null,
      }),
    ).rejects.toEqual(new ReviewUnreadableError("unknown version 2"));
    expect(repository.writeCount()).toBe(0);
  });
});
