import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryLastFullReview } from "../../../tests/in-memory-last-full-review";
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

function setup(lastFullReviewAt: string | null = null) {
  const repository = createInMemoryTaskRepository();
  const lastFullReview = createInMemoryLastFullReview(lastFullReviewAt);
  const readReview = createReadReview({
    repository,
    // Wednesday October 14, 2026, 09:00 in UTC+8: the logical day October 14.
    clock: createFixedClock("2026-10-14T09:00:00+08:00"),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
    lastFullReview,
  });
  return { repository, lastFullReview, readReview };
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
        keep: {
          step: "dueForReview",
          tasks: new Map([
            [2, october(10)],
            [4, october(12)],
          ]),
        },
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
        (
          await readReview({
            keep: { step: "dueForReview", tasks: new Map([[2, october(8)]]) },
          })
        ).steps.dueForReview.total,
      ).toBe(2);
    });

    it("does not list a kept task once it is no longer a task", async () => {
      const { repository, readReview } = setup();
      repository.addTask({ id: 1, status: "todo", review: plan(1) });
      repository.addTask({ id: 2, status: "todo", review: plan(1) });
      await repository.dropTask(2);

      const read = await readReview({
        keep: { step: "dueForReview", tasks: new Map([[2, october(8)]]) },
      });

      expect(ids(read.steps.dueForReview.items)).toEqual([1]);
    });
  });

  describe("inbox", () => {
    it("lists the tasks in the inbox, in the order they were captured", async () => {
      const { repository, readReview } = setup();
      repository.addTask({
        id: 1,
        status: "inbox",
        created: new Date("2026-10-12T08:00:00+08:00"),
      });
      repository.addTask({ id: 2, status: "todo" });
      repository.addTask({
        id: 3,
        status: "inbox",
        created: new Date("2026-10-10T08:00:00+08:00"),
      });
      repository.addTask({
        id: 4,
        status: "inbox",
        created: new Date("2026-10-13T08:00:00+08:00"),
      });

      const read = await readReview();

      expect(ids(read.steps.inbox.items)).toEqual([3, 1, 4]);
      expect(read.steps.inbox.total).toBe(3);
    });

    it("still lists a kept task after it left the inbox, in its place by capture, marked as kept", async () => {
      const { repository, readReview } = setup();
      repository.addTask({
        id: 1,
        status: "inbox",
        created: new Date("2026-10-12T08:00:00+08:00"),
      });
      // Clarified to todo while the step showed.
      repository.addTask({
        id: 2,
        status: "todo",
        created: new Date("2026-10-11T08:00:00+08:00"),
      });
      repository.addTask({
        id: 3,
        status: "inbox",
        created: new Date("2026-10-10T08:00:00+08:00"),
      });

      const read = await readReview({
        keep: { step: "inbox", tasks: new Set([2]) },
      });

      expect(
        read.steps.inbox.items.map((item) => [item.task.id, item.kept]),
      ).toEqual([
        [3, false],
        [2, true],
        [1, false],
      ]);
      expect(read.steps.inbox.total).toBe(2);
    });
  });

  describe("next actions", () => {
    it("lists the next actions, the highest score first, whatever blocks the others", async () => {
      const { repository, readReview } = setup();
      repository.addTask({ id: 1, status: "todo", importance: 2 });
      // Held back by its open subtask 3.
      repository.addTask({ id: 2, status: "todo", importance: 7 });
      repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
      repository.addTask({ id: 4, status: "doing", due: october(14) });
      repository.addTask({ id: 5, status: "waiting" });

      const read = await readReview();

      expect(ids(read.steps.nextActions.items)).toEqual([4, 3, 1]);
      expect(read.steps.nextActions.total).toBe(3);
    });

    it("still lists a kept task after it stopped being a next action, in its place by score, marked as kept", async () => {
      const { repository, readReview } = setup();
      repository.addTask({ id: 1, status: "todo", importance: 2 });
      // Changed to waiting while the step showed.
      repository.addTask({ id: 2, status: "waiting", importance: 7 });

      const read = await readReview({
        keep: { step: "nextActions", tasks: new Set([2]) },
      });

      expect(
        read.steps.nextActions.items.map((item) => [item.task.id, item.kept]),
      ).toEqual([
        [2, true],
        [1, false],
      ]);
      expect(read.steps.nextActions.total).toBe(1);
      // Still in the waiting step, as a waiting task.
      expect(read.steps.waiting.items).toEqual([
        expect.objectContaining({ kept: false }),
      ]);
    });
  });

  describe("waiting and someday", () => {
    it("lists the waiting tasks and the someday tasks in their own steps, the highest score first", async () => {
      const { repository, readReview } = setup();
      repository.addTask({ id: 1, status: "waiting", importance: 2 });
      repository.addTask({ id: 2, status: "someday", importance: 2 });
      repository.addTask({ id: 3, status: "waiting", due: october(14) });
      repository.addTask({ id: 4, status: "someday", importance: 7 });
      repository.addTask({ id: 5, status: "todo" });
      // Under a waiting parent: parked, but still in its own status's step.
      repository.addTask({ id: 6, status: "someday" }, { parentId: 1 });

      const read = await readReview();

      expect(ids(read.steps.waiting.items)).toEqual([3, 1]);
      expect(read.steps.waiting.total).toBe(2);
      expect(ids(read.steps.someday.items)).toEqual([4, 6, 2]);
      expect(read.steps.someday.total).toBe(3);
    });

    it("still lists a kept task after it was activated, in its place by score, marked as kept", async () => {
      const { repository, readReview } = setup();
      repository.addTask({ id: 1, status: "someday", importance: 2 });
      // Activated (to todo) while the step showed.
      repository.addTask({ id: 2, status: "todo", importance: 5 });
      repository.addTask({ id: 3, status: "someday", importance: 7 });

      const read = await readReview({
        keep: { step: "someday", tasks: new Set([2]) },
      });

      expect(
        read.steps.someday.items.map((item) => [item.task.id, item.kept]),
      ).toEqual([
        [3, false],
        [2, true],
        [1, false],
      ]);
      expect(read.steps.someday.total).toBe(2);
      // Kept in the someday step only.
      expect(read.steps.waiting.items).toEqual([]);
    });
  });

  describe("tasks in several steps", () => {
    it("lists a task in every step it belongs to", async () => {
      const { repository, readReview } = setup();
      // A next action due for review.
      repository.addTask({ id: 1, status: "todo", review: plan(1) });
      // A waiting task due for review.
      repository.addTask({ id: 2, status: "waiting", review: plan(null, 3) });

      const read = await readReview();

      expect(ids(read.steps.nextActions.items)).toEqual([1]);
      expect(ids(read.steps.waiting.items)).toEqual([2]);
      expect(ids(read.steps.dueForReview.items)).toEqual([2, 1]);
    });
  });

  describe("summary", () => {
    it("counts the tasks left in the inbox, the overdue tasks and the tasks due for review", async () => {
      const { repository, readReview } = setup();
      repository.addTask({ id: 1, status: "inbox" });
      repository.addTask({ id: 2, status: "inbox", due: october(1) });
      // Overdue: due yesterday.
      repository.addTask({ id: 3, status: "todo", due: october(13) });
      // Not overdue: due today.
      repository.addTask({ id: 4, status: "todo", due: october(14) });
      // Done: neither overdue nor due for review.
      repository.addTask({
        id: 5,
        status: "done",
        due: october(2),
        review: plan(1),
      });
      // Overdue and due for review.
      repository.addTask({
        id: 6,
        status: "someday",
        due: october(10),
        review: plan(1),
      });

      const { summary } = await readReview();

      expect(summary.inbox).toBe(2);
      expect(summary.overdue).toBe(3);
      expect(summary.dueForReview).toBe(1);
    });

    it("gives when the last full review was completed and how many logical days ago", async () => {
      // October 9, 23:30 in UTC+8: the logical day October 9.
      const { readReview } = setup("2026-10-09T23:30:00+08:00");

      const { lastFullReview } = await readReview();

      expect(lastFullReview?.at).toEqual(new Date("2026-10-09T15:30:00Z"));
      expect(lastFullReview?.daysAgo).toBe(5);
    });

    it("counts a full review completed before the day boundary toward the logical day before", async () => {
      // October 14, 03:00 in UTC+8: still the logical day October 13.
      const { readReview } = setup("2026-10-14T03:00:00+08:00");

      expect((await readReview()).lastFullReview?.daysAgo).toBe(1);
    });

    it("gives no last full review when none was completed or its moment is lost", async () => {
      const { readReview } = setup(null);

      expect((await readReview()).lastFullReview).toBeNull();
    });
  });
});
