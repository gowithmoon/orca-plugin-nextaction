import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryLastFullReview } from "../../../tests/in-memory-last-full-review";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createCompleteFullReview } from "./complete-full-review";
import { createReadReview } from "./read-review";

function setup(lastFullReviewAt: string | null) {
  // Wednesday October 14, 2026, 09:00 in UTC+8: the logical day October 14.
  const clock = createFixedClock("2026-10-14T09:00:00+08:00");
  const repository = createInMemoryTaskRepository();
  const lastFullReview = createInMemoryLastFullReview(lastFullReviewAt);
  const deps = {
    repository,
    clock,
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
    lastFullReview,
  };
  return {
    repository,
    clock,
    readReview: createReadReview(deps),
    completeFullReview: createCompleteFullReview(deps),
  };
}

describe("complete full review", () => {
  it("records now as when the last full review was completed", async () => {
    const { readReview, completeFullReview } = setup(
      "2026-10-07T20:00:00+08:00",
    );

    await completeFullReview();

    expect((await readReview()).lastFullReview).toEqual({
      at: new Date("2026-10-14T01:00:00Z"),
      daysAgo: 0,
    });
  });

  it("records the moment when no full review was completed before", async () => {
    const { readReview, completeFullReview } = setup(null);

    await completeFullReview();

    expect((await readReview()).lastFullReview?.daysAgo).toBe(0);
  });

  it("moves look back's start to now: what was completed before no longer shows", async () => {
    const { repository, readReview, completeFullReview, clock } = setup(
      "2026-10-07T20:00:00+08:00",
    );
    repository.addTask(
      { id: 1, status: "done" },
      {
        completionHistory: {
          kind: "readable",
          history: [
            {
              at: new Date("2026-10-13T10:00:00+08:00"),
              day: { year: 2026, month: 10, day: 13 },
            },
          ],
        },
      },
    );
    expect((await readReview()).summary.completedInLookBack).toBe(1);

    await completeFullReview();
    clock.set("2026-10-14T10:00:00+08:00");
    const read = await readReview();

    expect(read.steps.lookBack.entries).toEqual([]);
    expect(read.summary.completedInLookBack).toBe(0);
  });

  it("writes nothing to the tasks", async () => {
    const { repository, completeFullReview } = setup(null);
    repository.addTask({ id: 1, status: "inbox" });

    await completeFullReview();

    expect(repository.writeCount()).toBe(0);
  });
});
