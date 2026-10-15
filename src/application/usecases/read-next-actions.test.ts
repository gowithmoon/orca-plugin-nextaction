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

describe("read next actions with custom properties", () => {
  it("gives the same next actions in the same score order whether or not tasks hold custom properties", async () => {
    const read = async (withCustom: boolean) => {
      const { repository, readNextActions } = setup();
      repository.setCustomPropertyDefinitions(
        withCustom
          ? [
              { name: "截止", kind: "date" },
              { name: "优先", kind: "number" },
              { name: "已报销", kind: "boolean" },
            ]
          : [],
      );
      const custom = withCustom
        ? {
            customProperties: {
              截止: {
                kind: "date",
                value: { year: 2026, month: 10, day: 1 },
              },
              优先: { kind: "number", value: 7 },
              已报销: { kind: "boolean", value: true },
            } as const,
          }
        : {};
      repository.addTask({ id: 1, status: "todo", importance: 2, ...custom });
      repository.addTask({ id: 2, status: "waiting", ...custom });
      repository.addTask({
        id: 3,
        status: "doing",
        due: { year: 2026, month: 10, day: 9 },
      });
      repository.addTask({ id: 4, status: "todo", ...custom });
      return (await readNextActions()).items.map((item) => item.task.id);
    };

    expect(await read(false)).toEqual([3, 4, 1]);
    expect(await read(true)).toEqual([3, 4, 1]);
  });

  it("does not take a block reference custom property pointing at an unfinished task for a dependency", async () => {
    const { repository, readNextActions } = setup();
    repository.setCustomPropertyDefinitions([
      { name: "关联任务", kind: "blockRefs", scope: null },
    ]);
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({
      id: 2,
      status: "todo",
      customProperties: { 关联任务: { kind: "blockRefs", value: [1] } },
    });

    const ids = (await readNextActions()).items.map((item) => item.task.id);

    expect(ids).toContain(2);
    expect(ids).toContain(1);
  });
});

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

describe("read next actions with projects", () => {
  it("lists a task under a project block only while the project is active", async () => {
    const { repository, readNextActions } = setup();
    repository.addProject({ id: 1, text: "Move house", status: "planning" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addProject({ id: 3, text: "Trip", status: "active" });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });

    const read = await readNextActions();

    expect(read.items.map((item) => item.task.id)).toEqual([4]);
  });

  it.each([
    ["planning", false],
    ["active", true],
    ["paused", false],
    ["someday", false],
    ["done", false],
  ] as const)(
    "a task of a %s project is a next action: %s",
    async (status, listed) => {
      const { repository, readNextActions } = setup();
      repository.addProject({ id: 1, status });
      repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });

      const read = await readNextActions();

      expect(read.items.map((item) => item.task.id)).toEqual(listed ? [2] : []);
    },
  );

  it("belongs to the nearest project block, plain blocks and tasks in between not counting", async () => {
    const { repository, readNextActions } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addBlock(2, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });
    // A project block below a project block is just another project.
    repository.addProject({ id: 5, status: "paused" }, { parentId: 1 });
    repository.addTask({ id: 6, status: "todo" }, { parentId: 5 });

    const read = await readNextActions();

    expect(read.items.map((item) => item.task.id)).toEqual([4]);
  });

  it("goes by the top task's project: a project block below a task does not move its subtasks", async () => {
    const { repository, readNextActions } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addProject({ id: 3, status: "paused" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });
    repository.addTask({ id: 5, status: "todo" }, { parentId: 2 });

    const read = await readNextActions();

    // Task 2 waits for its subtasks 4 and 5; 4 belongs to project 1, as its
    // parent task does (ADR 0025), so it is a next action.
    expect(read.items.map((item) => item.task.id)).toEqual([4, 5]);
  });

  it("leaves tasks that belong to no project as they are", async () => {
    const { repository, readNextActions } = setup();
    repository.addProject({ id: 1, status: "paused" });
    repository.addTask({ id: 2, status: "todo" });
    repository.addBlock(3);
    repository.addTask({ id: 4, status: "doing" }, { parentId: 3 });

    const read = await readNextActions();

    expect(read.items.map((item) => item.task.id)).toEqual([2, 4]);
  });

  it("treats a block with both tags as a task of the project above it, and the project of the tasks below it", async () => {
    const { repository, readNextActions } = setup();
    repository.addProject({ id: 1, status: "paused" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addProject({ id: 2, status: "active" });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo", sequential: true });
    repository.addProject({ id: 4, status: "planning" });
    repository.addTask({ id: 5, status: "todo" }, { parentId: 4 });
    repository.addTask({ id: 6, status: "todo" });
    repository.addProject({ id: 6, status: "planning" });

    const read = await readNextActions();

    // 2 is not its own task's project: it belongs to project 1 (paused), and
    // so does its subtask 3. A block with both tags and no project above it
    // belongs to none: 6 is a next action, while 5 belongs to project 4.
    expect(read.items.map((item) => item.task.id)).toEqual([6]);
  });

  it("lets a task of an active project in on the project's start day, the start preview days included", async () => {
    const { repository, startPreviewDays, readNextActions } = setup();
    // Today is the logical day 2026-10-09.
    repository.addProject({
      id: 1,
      status: "active",
      start: { year: 2026, month: 10, day: 12 },
    });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });

    expect((await readNextActions()).items).toEqual([]);
    startPreviewDays.set(3);
    expect((await readNextActions()).items.map((item) => item.task.id)).toEqual(
      [2],
    );
  });

  it("keeps a task out for a parked subtree, a done ancestor, a dependency or an earlier sibling, as without a project", async () => {
    const { repository, readNextActions } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "waiting" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "done" }, { parentId: 1 });
    repository.addTask({ id: 5, status: "todo" }, { parentId: 4 });
    repository.addTask({ id: 6, status: "todo" }, { parentId: 1 });
    repository.addTask(
      { id: 7, status: "todo", dependencies: [6] },
      { parentId: 1 },
    );
    repository.addTask({ id: 8, sequential: true }, { parentId: 1 });
    repository.addTask({ id: 9, status: "todo" }, { parentId: 8 });
    repository.addTask({ id: 10, status: "todo" }, { parentId: 8 });

    const read = await readNextActions();

    expect(
      read.items.map((item) => item.task.id).sort((a, b) => a - b),
    ).toEqual([6, 9]);
  });

  it("scales the score by the project's importance and urgency, as an ancestor task's, and not by its due date", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addProject({
      id: 2,
      status: "active",
      importance: 7,
      due: { year: 2026, month: 10, day: 1 },
    });
    repository.addTask(
      { id: 3, status: "inbox", importance: 1 },
      { parentId: 2 },
    );
    repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });
    repository.addProject({
      id: 5,
      status: "active",
      urgency: 1,
      due: { year: 2026, month: 9, day: 1 },
    });
    repository.addTask({ id: 6, status: "todo" }, { parentId: 5 });

    const read = await readNextActions();

    // 4: importance 50 × 0.85 (task 3) × 1.15 (project 2) ≈ 48.9, below the
    // plain 50 of task 1; 6: urgency 50 × 0.85 = 42.5; the projects' overdue
    // dates add nothing.
    expect(read.items.map((item) => item.task.id)).toEqual([1, 4, 6]);
  });

  it("ranks a task of an important project above the same task elsewhere", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addProject({ id: 2, status: "active", importance: 7 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });

    const read = await readNextActions();

    expect(read.items.map((item) => item.task.id)).toEqual([3, 1]);
  });
});
