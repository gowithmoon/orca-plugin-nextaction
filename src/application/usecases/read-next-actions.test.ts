import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadNextActions } from "./read-next-actions";

/** 2026-10-09 10:00 in UTC+8: the logical day 2026-10-09. */
const morning = "2026-10-09T10:00:00+08:00";

function setup() {
  const repository = createInMemoryTaskRepository();
  const clock = createFixedClock(morning);
  const dayBoundary = createFixedDayBoundary();
  const startPreviewDays = createFixedStartPreviewDays();
  const readNextActions = createReadNextActions({
    repository,
    clock,
    dayBoundary,
    startPreviewDays,
  });
  return { repository, clock, startPreviewDays, readNextActions };
}

describe("read next actions", () => {
  it("lists the next actions, the highest score first", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, status: "todo", importance: 2 });
    repository.addTask({ id: 2, status: "inbox" });
    repository.addTask({
      id: 3,
      status: "doing",
      due: { year: 2026, month: 10, day: 9 },
    });
    repository.addTask({ id: 4, status: "todo" });

    const read = await readNextActions();

    expect(read.items.map((item) => item.task.id)).toEqual([3, 4, 1]);
  });

  it("does not list the tasks under a done ancestor task, at any level", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, status: "done" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "inbox" }, { parentId: 1 });
    repository.addTask({ id: 4, status: "doing" }, { parentId: 3 });
    repository.addTask({ id: 5, status: "todo" });

    const read = await readNextActions();

    expect(read.items.map((item) => item.task.id)).toEqual([5]);
    expect(read.total).toBe(1);
  });

  it("keeps the task given as `keep` after it left the list, by its score, marked as kept", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, status: "todo", importance: 7 });
    repository.addTask({ id: 2, status: "done", importance: 5 });
    repository.addTask({ id: 3, status: "todo", importance: 1 });

    const read = await readNextActions({ keep: 2 });

    expect(read.items.map((item) => [item.task.id, item.nextAction])).toEqual([
      [1, true],
      [2, false],
      [3, true],
    ]);
  });

  it("counts only the next actions in the total, not a kept task", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" });
    repository.addTask({ id: 3, status: "doing" });

    expect((await readNextActions({ keep: 2 })).total).toBe(2);
    expect((await readNextActions()).total).toBe(2);
  });

  it("does not list the task given as `keep` once it is no longer a task", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "waiting" });
    await repository.dropTask(2);

    const read = await readNextActions({ keep: 2 });

    expect(read.items.map((item) => item.task.id)).toEqual([1]);
  });

  it("gives each task its nearest parent task's text, plain blocks in between not counting, or none", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, text: "Move house", status: "inbox" });
    repository.addBlock(2, { parentId: 1 });
    repository.addTask(
      { id: 3, text: "Pack books", status: "todo" },
      { parentId: 2 },
    );
    repository.addTask({ id: 4, text: "Call mum", status: "todo" });

    const read = await readNextActions();

    expect(read.items.map((item) => [item.task.id, item.parentText])).toEqual([
      [3, "Move house"],
      [4, null],
    ]);
  });

  describe("filtered", () => {
    /** The ids listed, in order. */
    const ids = (read: { items: readonly { task: { id: number } }[] }) =>
      read.items.map((item) => item.task.id);

    it("by contexts: a task holding any one of the chosen contexts", async () => {
      const { repository, readNextActions } = setup();
      repository.addTask({ id: 1, status: "todo", contexts: ["office"] });
      repository.addTask({
        id: 2,
        status: "todo",
        contexts: ["phone", "home"],
      });
      repository.addTask({ id: 3, status: "todo", contexts: ["home"] });
      repository.addTask({ id: 4, status: "todo" });

      const read = await readNextActions({
        filter: { contexts: { values: ["office", "phone"], none: false } },
      });

      expect(ids(read)).toEqual([1, 2]);
    });

    it('by contexts with "(none)" alone: only tasks with no context', async () => {
      const { repository, readNextActions } = setup();
      repository.addTask({ id: 1, status: "todo", contexts: ["office"] });
      repository.addTask({ id: 2, status: "todo" });

      const read = await readNextActions({
        filter: { contexts: { values: [], none: true } },
      });

      expect(ids(read)).toEqual([2]);
    });

    it('by contexts with "(none)" and a context: either one', async () => {
      const { repository, readNextActions } = setup();
      repository.addTask({ id: 1, status: "todo", contexts: ["office"] });
      repository.addTask({ id: 2, status: "todo" });
      repository.addTask({ id: 3, status: "todo", contexts: ["home"] });

      const read = await readNextActions({
        filter: { contexts: { values: ["office"], none: true } },
      });

      expect(ids(read)).toEqual([1, 2]);
    });

    it("by contexts and labels together: a task both let through", async () => {
      const { repository, readNextActions } = setup();
      repository.addTask({
        id: 1,
        status: "todo",
        contexts: ["office"],
        labels: ["work"],
      });
      repository.addTask({ id: 2, status: "todo", contexts: ["office"] });
      repository.addTask({ id: 3, status: "todo", labels: ["work"] });
      repository.addTask({
        id: 4,
        status: "todo",
        contexts: ["office"],
        labels: ["errand"],
      });

      const read = await readNextActions({
        filter: {
          contexts: { values: ["office"], none: false },
          labels: { values: ["work"], none: true },
        },
      });

      expect(ids(read)).toEqual([1, 2]);
    });

    it("by importance: a task at any one of the chosen levels", async () => {
      const { repository, readNextActions } = setup();
      repository.addTask({ id: 1, status: "todo", importance: 7 });
      repository.addTask({ id: 2, status: "todo", importance: 5 });
      repository.addTask({ id: 3, status: "todo", importance: 4 });
      repository.addTask({ id: 4, status: "todo", importance: 1 });

      const read = await readNextActions({
        filter: { importance: [1, 5, 7] },
      });

      expect(ids(read)).toEqual([1, 2, 4]);
    });

    it("by urgency: a task at any one of the chosen levels, its own urgency", async () => {
      const { repository, readNextActions } = setup();
      repository.addTask({ id: 1, status: "todo", urgency: 7 });
      repository.addTask({ id: 2, status: "todo", urgency: 5 });
      repository.addTask({ id: 3, status: "todo", urgency: 4 });
      repository.addTask({ id: 4, status: "todo", urgency: 1 });
      // A subtask at the default under a parent at 7 is still at 4.
      repository.addTask({ id: 5, status: "todo", urgency: 7 });
      repository.addTask({ id: 6, status: "todo" }, { parentId: 5 });

      const read = await readNextActions({
        filter: { urgency: [1, 5, 7] },
      });

      expect(ids(read).sort((a, b) => a - b)).toEqual([1, 2, 4]);
    });

    it("by urgency and another dimension: only a task both let through", async () => {
      const { repository, readNextActions } = setup();
      repository.addTask({
        id: 1,
        status: "todo",
        urgency: 6,
        contexts: ["office"],
      });
      repository.addTask({ id: 2, status: "todo", urgency: 6 });
      repository.addTask({
        id: 3,
        status: "todo",
        urgency: 2,
        contexts: ["office"],
      });

      const read = await readNextActions({
        filter: {
          contexts: { values: ["office"], none: false },
          urgency: [6, 7],
        },
      });

      expect(ids(read)).toEqual([1]);
    });

    it("with nothing chosen in any dimension: every next action", async () => {
      const { repository, readNextActions } = setup();
      repository.addTask({ id: 1, status: "todo", contexts: ["office"] });
      repository.addTask({ id: 2, status: "todo", labels: ["work"] });
      repository.addTask({ id: 3, status: "todo" });

      const read = await readNextActions({
        filter: {
          contexts: { values: [], none: false },
          labels: { values: [], none: false },
          importance: [],
          urgency: [],
        },
      });

      expect(ids(read)).toEqual([1, 2, 3]);
    });

    it("counts every next action in the total, whatever the filter lets through", async () => {
      const { repository, readNextActions } = setup();
      repository.addTask({ id: 1, status: "todo", contexts: ["office"] });
      repository.addTask({ id: 2, status: "todo" });
      repository.addTask({ id: 3, status: "doing", contexts: ["home"] });

      const read = await readNextActions({
        filter: { contexts: { values: ["office"], none: false } },
      });

      expect(ids(read)).toEqual([1]);
      expect(read.total).toBe(3);
    });

    it("keeps the task given as `keep` once the filter no longer lets it through, marked as kept", async () => {
      const { repository, readNextActions } = setup();
      repository.addTask({
        id: 1,
        status: "todo",
        importance: 7,
        contexts: ["office"],
      });
      repository.addTask({ id: 2, status: "todo", contexts: ["home"] });

      const read = await readNextActions({
        keep: 2,
        filter: { contexts: { values: ["office"], none: false } },
      });

      expect(
        read.items.map((item) => [item.task.id, item.nextAction, item.kept]),
      ).toEqual([
        [1, true, false],
        [2, true, true],
      ]);
    });
  });

  it("lists a task starting today plus the start preview days, not one starting a day later", async () => {
    const { repository, startPreviewDays, readNextActions } = setup();
    startPreviewDays.set(3);
    repository.addTask({
      id: 1,
      status: "todo",
      start: { year: 2026, month: 10, day: 12 },
    });
    repository.addTask({
      id: 2,
      status: "todo",
      start: { year: 2026, month: 10, day: 13 },
    });

    const read = await readNextActions();

    expect(read.items.map((item) => item.task.id)).toEqual([1]);
  });

  it("ranks a subtask of an important or urgent ancestor task above the same task elsewhere", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "inbox", importance: 7 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "inbox", urgency: 1 });
    repository.addTask({ id: 5, status: "todo" }, { parentId: 4 });

    const read = await readNextActions();

    expect(read.items.map((item) => item.task.id)).toEqual([3, 1, 5]);
  });

  it("ranks a task that started long ago above one that started today", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({
      id: 1,
      status: "todo",
      start: { year: 2026, month: 10, day: 9 },
    });
    repository.addTask({
      id: 2,
      status: "todo",
      start: { year: 2026, month: 9, day: 19 },
    });

    const read = await readNextActions();

    expect(read.items.map((item) => item.task.id)).toEqual([2, 1]);
  });
});
