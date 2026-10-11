import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { ReviewRead } from "../../domain/review/review";
import { createReadReview } from "./read-review";

const weekly = { every: 1, unit: "week" } as const;
const october = (day: number) => ({ year: 2026, month: 10, day });

/**
 * A review plan: weekly, last reviewed on October `last` (none: no
 * interval), with a review-on day on October `on`.
 */
const plan = (last: number | null, on: number | null = null): ReviewRead => ({
  kind: "plan",
  plan: {
    interval: last === null ? null : weekly,
    lastReviewed: last === null ? null : october(last),
    reviewOn: on === null ? null : october(on),
  },
});

function setup() {
  const repository = createInMemoryTaskRepository();
  const readReview = createReadReview({
    repository,
    // Wednesday October 14, 2026, 09:00 in UTC+8: the logical day October 14.
    clock: createFixedClock("2026-10-14T09:00:00+08:00"),
    dayBoundary: createFixedDayBoundary(),
  });
  return { repository, readReview };
}

/** The listed tasks' IDs, in order. */
const ids = (items: readonly { task: { id: number } }[]) =>
  items.map((item) => item.task.id);

describe("read review", () => {
  describe("tasks due for review", () => {
    it("lists only the tasks due for review, the earliest review due day first", async () => {
      const { repository, readReview } = setup();
      // Due October 13: reviewed October 6, weekly.
      repository.addTask({ id: 1, status: "todo", review: plan(6) });
      // Not due: its next review is October 16.
      repository.addTask({ id: 2, status: "todo", review: plan(9) });
      // Due October 2 by its review-on day, its interval coming later.
      repository.addTask({ id: 3, status: "waiting", review: plan(12, 2) });
      // Due today by its review-on day alone.
      repository.addTask({ id: 4, status: "someday", review: plan(null, 14) });
      repository.addTask({ id: 5, status: "todo" });
      // Due October 8.
      repository.addTask({ id: 6, status: "doing", review: plan(1) });

      const read = await readReview();

      expect(ids(read.steps.dueForReview.items)).toEqual([3, 6, 1, 4]);
    });

    it("does not list a done task, though its review plan has come due", async () => {
      const { repository, readReview } = setup();
      repository.addTask({ id: 1, status: "done", review: plan(1, 2) });
      repository.addTask({ id: 2, status: "todo", review: plan(1) });

      const read = await readReview();

      expect(ids(read.steps.dueForReview.items)).toEqual([2]);
    });

    it("still lists a kept task after it is no longer due for review, in the place it was listed under, marked as kept", async () => {
      const { repository, readReview } = setup();
      // Due October 8.
      repository.addTask({ id: 1, status: "todo", review: plan(1) });
      // Listed under October 10, then marked reviewed today: no longer due.
      repository.addTask({ id: 2, status: "todo", review: plan(14) });
      // Due October 13.
      repository.addTask({ id: 3, status: "todo", review: plan(6) });
      // Kept but still due, now on October 9: listed by that day.
      repository.addTask({ id: 4, status: "todo", review: plan(2) });

      const read = await readReview({
        keep: new Map([
          [2, october(10)],
          [4, october(12)],
        ]),
      });

      expect(
        read.steps.dueForReview.items.map((item) => [item.task.id, item.kept]),
      ).toEqual([
        [1, false],
        [4, false],
        [2, true],
        [3, false],
      ]);
    });

    it("counts only the tasks due for review, not a kept one", async () => {
      const { repository, readReview } = setup();
      repository.addTask({ id: 1, status: "todo", review: plan(1) });
      repository.addTask({ id: 2, status: "done", review: plan(1) });
      repository.addTask({ id: 3, status: "todo", review: plan(6) });

      expect(
        (await readReview({ keep: new Map([[2, october(8)]]) })).steps
          .dueForReview.total,
      ).toBe(2);
    });

    it("does not list a kept task once it is no longer a task", async () => {
      const { repository, readReview } = setup();
      repository.addTask({ id: 1, status: "todo", review: plan(1) });
      repository.addTask({ id: 2, status: "todo", review: plan(1) });
      await repository.dropTask(2);

      const read = await readReview({ keep: new Map([[2, october(8)]]) });

      expect(ids(read.steps.dueForReview.items)).toEqual([1]);
    });
  });
});
