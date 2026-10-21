import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import type { Task } from "../../domain/task/task";
import {
  createCanMarkReviewed,
  createMarkReviewed,
  NotMarkableError,
} from "./mark-reviewed";
import { ReviewUnreadableError } from "./review-unreadable-error";

const weekly = { every: 1, unit: "week" } as const;
const oct1 = { year: 2026, month: 10, day: 1 };
const oct10 = { year: 2026, month: 10, day: 10 };
const oct14 = { year: 2026, month: 10, day: 14 };

const deps = (repository: InMemoryTaskRepository) => ({
  repository,
  // Wednesday October 14, 2026, 09:00 in UTC+8.
  clock: createFixedClock("2026-10-14T09:00:00+08:00"),
  dayBoundary: createFixedDayBoundary(),
});

describe("mark a task reviewed", () => {
  it("records today as the last reviewed day and clears the review-on day, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      status: "todo",
      review: {
        kind: "plan",
        plan: { interval: weekly, lastReviewed: oct1, reviewOn: oct10 },
      },
    });
    await createMarkReviewed(deps(repository))(1);
    expect((await repository.getTask(1))?.review).toEqual({
      kind: "plan",
      plan: { interval: weekly, lastReviewed: oct14, reviewOn: null },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it.each([
    [
      "has no review plan",
      { status: "todo", review: { kind: "none" } },
      "no-plan",
    ],
    [
      "is done",
      {
        status: "done",
        review: {
          kind: "plan",
          plan: { interval: weekly, lastReviewed: oct1, reviewOn: null },
        },
      },
      "done",
    ],
  ] as const)(
    "refuses a task that %s, writing nothing",
    async (_, task, reason) => {
      const repository = createInMemoryTaskRepository();
      repository.addTask({ id: 1, ...task });
      await expect(createMarkReviewed(deps(repository))(1)).rejects.toEqual(
        new NotMarkableError(reason),
      );
      expect(repository.writeCount()).toBe(0);
    },
  );

  it("refuses a review plan it cannot read, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      status: "todo",
      review: { kind: "unreadable", reason: "unknown version 2" },
    });
    await expect(createMarkReviewed(deps(repository))(1)).rejects.toEqual(
      new ReviewUnreadableError("unknown version 2"),
    );
    expect(repository.writeCount()).toBe(0);
  });
});

describe("whether the task menu offers Mark reviewed", () => {
  const canMark = createCanMarkReviewed();
  const task = (partial: Partial<Task>): Task => ({
    id: 1,
    text: "",
    searchText: "",
    status: "todo",
    importance: 4,
    urgency: 4,
    effort: 4,
    start: null,
    due: null,
    contexts: [],
    tags: [],
    note: null,
    sequential: false,
    dependencies: [],
    dependencyMode: "all",
    dependencyDelay: 0,
    created: new Date("2026-01-01T00:00:00.000Z"),
    recurrence: { kind: "none" },
    review: { kind: "none" },
    reminders: { kind: "none" },
    customProperties: {},
    anomalies: [],
    ...partial,
  });

  it("offers it for a task not done with a review interval or a review-on day", () => {
    expect(
      canMark(
        task({
          status: "someday",
          review: {
            kind: "plan",
            plan: { interval: null, lastReviewed: null, reviewOn: oct10 },
          },
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ["no review plan", task({ review: { kind: "none" } })],
    [
      "neither a review interval nor a review-on day",
      task({
        review: {
          kind: "plan",
          plan: { interval: null, lastReviewed: oct1, reviewOn: null },
        },
      }),
    ],
    [
      "a done task",
      task({
        status: "done",
        review: {
          kind: "plan",
          plan: { interval: weekly, lastReviewed: oct1, reviewOn: null },
        },
      }),
    ],
    [
      "a review plan it cannot read",
      task({ review: { kind: "unreadable", reason: "unknown version 2" } }),
    ],
  ])("does not offer it for %s", (_, shown) => {
    expect(canMark(shown)).toBe(false);
  });
});
