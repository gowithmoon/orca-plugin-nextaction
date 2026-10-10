import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { TaskId } from "../../domain/task/task";
import type { CompletionHistoryRead } from "../ports/task-repository";
import {
  type AllTasksNode,
  type AllTasksRead,
  createReadAllTasks,
} from "./read-all-tasks";

/** 2026-10-09 10:00 in UTC+8: the logical day 2026-10-09. */
const morning = "2026-10-09T10:00:00+08:00";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readAllTasks = createReadAllTasks({
    repository,
    clock: createFixedClock(morning),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, readAllTasks };
}

/** A tree written as ids: a leaf as its id, a node with children as [id, children]. */
type Shape = TaskId | [TaskId, Shape[]];

function shape(nodes: readonly AllTasksNode[]): Shape[] {
  return nodes.map((node) =>
    node.children.length === 0
      ? node.task.id
      : [node.task.id, shape(node.children)],
  );
}

describe("read all tasks", () => {
  it("lists every task not done, of any status, in note order", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "waiting" }, { position: 30 });
    repository.addTask({ id: 2, status: "inbox" }, { position: 10 });
    repository.addTask({ id: 3, status: "someday" }, { position: 50 });
    repository.addTask({ id: 4, status: "doing" }, { position: 20 });
    repository.addTask({ id: 5, status: "todo" }, { position: 40 });

    const read = await readAllTasks();

    expect(shape(read.tree)).toEqual([2, 4, 1, 5, 3]);
  });

  it("puts each subtask under its parent task, plain blocks in between not counting", async () => {
    const { repository, readAllTasks } = setup();
    // A page task (no parent block) holding a plain block holding a task.
    repository.addTask({ id: 1, text: "Move house", status: "todo" });
    repository.addBlock(2, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "inbox" }, { parentId: 3 });
    repository.addTask({ id: 5, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 6, status: "waiting" });

    const read = await readAllTasks();

    expect(shape(read.tree)).toEqual([[1, [[3, [4]], 5]], 6]);
  });

  describe("done tasks", () => {
    it("keeps a done subtask of a task not done, and its done subtasks, faded as done", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "doing" });
      repository.addTask({ id: 2, status: "done" }, { parentId: 1 });
      repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
      repository.addTask({ id: 4, status: "todo" }, { parentId: 1 });

      const read = await readAllTasks();

      expect(shape(read.tree)).toEqual([[1, [[2, [3]], 4]]]);
      expect(fades(read.tree)).toEqual([
        [1, null],
        [2, "done"],
        [3, "done"],
        [4, null],
      ]);
    });

    it("keeps a done task holding a task not done, faded as done", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "done" });
      repository.addBlock(2, { parentId: 1 });
      repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
      repository.addTask({ id: 4, status: "someday" }, { parentId: 3 });
      repository.addTask({ id: 5, status: "done" }, { parentId: 1 });

      const read = await readAllTasks();

      expect(shape(read.tree)).toEqual([[1, [[3, [4]], 5]]]);
      expect(fades(read.tree)).toEqual([
        [1, "done"],
        [3, "done"],
        [4, null],
        [5, "done"],
      ]);
    });

    it("leaves out a top-level task done with all its descendant tasks", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "todo" });
      repository.addTask({ id: 2, status: "done" });
      repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
      repository.addTask({ id: 4, status: "done" });

      const read = await readAllTasks();

      expect(shape(read.tree)).toEqual([1]);
    });

    it("shows each task once, however deep and mixed the subtree", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "done" });
      repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
      repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
      repository.addBlock(4, { parentId: 3 });
      repository.addTask({ id: 5, status: "inbox" }, { parentId: 4 });
      repository.addTask({ id: 6, status: "done" }, { parentId: 1 });

      const read = await readAllTasks({ keep: 6 });

      expect(fades(read.tree).map(([id]) => id)).toEqual([1, 2, 3, 5, 6]);
    });
  });

  describe("blocked mark", () => {
    it("marks a task to do or in progress whose dependency is not met", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "todo" });
      repository.addTask({ id: 2, status: "todo", dependencies: [1] });
      repository.addTask({ id: 3, status: "doing", dependencies: [1] });
      repository.addTask({ id: 4, status: "done" });
      repository.addTask({ id: 5, status: "todo", dependencies: [4] });

      const read = await readAllTasks();

      expect(marks(read.tree)).toEqual([
        [1, false],
        [2, true],
        [3, true],
        [5, false],
      ]);
    });

    it("marks a subtask blocked by its ancestor task's dependency", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "todo" });
      repository.addTask({ id: 2, status: "todo", dependencies: [1] });
      repository.addBlock(3, { parentId: 2 });
      repository.addTask({ id: 4, status: "doing" }, { parentId: 3 });

      const read = await readAllTasks();

      expect(marks(read.tree)).toEqual([
        [1, false],
        [2, true],
        [4, true],
      ]);
    });

    it("marks later subtasks of a sequential parent, and their subtasks", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "todo", sequential: true });
      repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
      repository.addTask({ id: 3, status: "todo" }, { parentId: 1 });
      repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });

      const read = await readAllTasks();

      expect(marks(read.tree)).toEqual([
        [1, false],
        [2, false],
        [3, true],
        [4, true],
      ]);
    });

    it("marks the tasks on a dependency cycle", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "todo", dependencies: [2] });
      repository.addTask({ id: 2, status: "doing", dependencies: [1] });
      // A subtask depending on its ancestor task is a cycle too: the parent,
      // otherwise held back only by its subtasks, is marked for the cycle.
      repository.addTask({ id: 3, status: "todo" });
      repository.addTask(
        { id: 4, status: "todo", dependencies: [3] },
        { parentId: 3 },
      );

      const read = await readAllTasks();

      expect(marks(read.tree)).toEqual([
        [1, true],
        [2, true],
        [3, true],
        [4, true],
      ]);
    });

    it("keeps the open tasks under a done ancestor task in the tree, unmarked", async () => {
      // They are out of the next actions for the done ancestor, not blocked.
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "done" });
      repository.addTask({ id: 2, status: "inbox" }, { parentId: 1 });
      repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });

      const read = await readAllTasks();

      expect(shape(read.tree)).toEqual([[1, [[2, [3]]]]]);
      expect(marks(read.tree)).toEqual([
        [1, false],
        [2, false],
        [3, false],
      ]);
      expect(doneIds(read)).toEqual([]);
    });

    it("does not mark a task held back only by its subtasks", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "doing" });
      repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });

      const read = await readAllTasks();

      expect(marks(read.tree)).toEqual([
        [1, false],
        [2, false],
      ]);
    });

    it("does not mark a blocked task in the inbox, waiting or someday", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "todo" });
      repository.addTask({ id: 2, status: "inbox", dependencies: [1] });
      repository.addTask({ id: 3, status: "waiting", dependencies: [1] });
      repository.addTask({ id: 4, status: "someday", dependencies: [1] });

      const read = await readAllTasks();

      expect(marks(read.tree)).toEqual([
        [1, false],
        [2, false],
        [3, false],
        [4, false],
      ]);
    });
  });
});

describe("read all tasks, keeping the task being viewed", () => {
  it("keeps a task given as `keep` that would leave the tree, in its place, faded as kept", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" });
    repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" });

    const read = await readAllTasks({ keep: 2 });

    expect(shape(read.tree)).toEqual([1, 2, 4]);
    expect(fades(read.tree)).toEqual([
      [1, null],
      [2, "kept"],
      [4, null],
    ]);
  });

  it("shows only the ancestor tasks of a kept task deep in a done subtree, for where it sits", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "done" });
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "done" }, { parentId: 3 });
    repository.addTask({ id: 5, status: "done" }, { parentId: 2 });
    repository.addTask({ id: 6, status: "done" }, { parentId: 1 });

    const read = await readAllTasks({ keep: 3 });

    expect(shape(read.tree)).toEqual([[1, [[2, [3]]]]]);
    expect(fades(read.tree)).toEqual([
      [1, "done"],
      [2, "done"],
      [3, "kept"],
    ]);
  });

  it("does not mark as kept a task given as `keep` that is in the tree anyway", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });

    const read = await readAllTasks({ keep: 2 });

    expect(fades(read.tree)).toEqual([
      [1, null],
      [2, "done"],
    ]);
  });

  it("does not keep a task given as `keep` once it is no longer a task", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" });
    await repository.dropTask(2);

    const read = await readAllTasks({ keep: 2 });

    expect(shape(read.tree)).toEqual([1]);
  });
});

describe("read all tasks, sorted", () => {
  const day = (month: number, d: number) => ({ year: 2026, month, day: d });

  it("by due day orders top-level tasks earliest first, those without one last, subtasks kept in note order", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "todo", due: day(10, 20) });
    repository.addTask({ id: 3, status: "todo", due: day(10, 12) });
    repository.addTask(
      { id: 4, status: "todo", due: day(10, 30) },
      { parentId: 3 },
    );
    repository.addTask(
      { id: 5, status: "todo", due: day(10, 1) },
      { parentId: 3 },
    );

    const read = await readAllTasks({ sort: "due" });

    expect(shape(read.tree)).toEqual([[3, [4, 5]], 2, 1]);
  });

  it("by start day orders top-level tasks by their own start, earliest first, those without one last", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "todo", start: day(10, 20) });
    repository.addTask({ id: 3, status: "someday", start: day(10, 12) });
    repository.addTask(
      { id: 4, status: "todo", start: day(10, 1) },
      { parentId: 1 },
    );

    const read = await readAllTasks({ sort: "start" });

    expect(shape(read.tree)).toEqual([3, 2, [1, [4]]]);
  });

  it("by importance orders top-level tasks highest first, ties in note order", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo", importance: 2 });
    repository.addTask({ id: 2, status: "todo", importance: 6 });
    repository.addTask({ id: 3, status: "inbox", importance: 2 });
    repository.addTask(
      { id: 4, status: "todo", importance: 7 },
      { parentId: 3 },
    );
    repository.addTask(
      { id: 5, status: "todo", importance: 1 },
      { parentId: 3 },
    );

    const read = await readAllTasks({ sort: "importance" });

    expect(shape(read.tree)).toEqual([2, 1, [3, [4, 5]]]);
  });

  it("by capture time orders top-level tasks newest first, ties in note order", async () => {
    const { repository, readAllTasks } = setup();
    const at = (iso: string) => new Date(iso);
    repository.addTask({
      id: 1,
      status: "todo",
      created: at("2026-10-01T09:00:00Z"),
    });
    repository.addTask({
      id: 2,
      status: "waiting",
      created: at("2026-10-05T09:00:00Z"),
    });
    repository.addTask({
      id: 3,
      status: "todo",
      created: at("2026-10-01T09:00:00Z"),
    });
    repository.addTask(
      { id: 4, status: "todo", created: at("2026-10-08T09:00:00Z") },
      { parentId: 3 },
    );

    const read = await readAllTasks({ sort: "captured" });

    expect(shape(read.tree)).toEqual([2, 1, [3, [4]]]);
  });

  it("by score orders top-level tasks of any status highest first, ties in note order", async () => {
    const { repository, readAllTasks } = setup();
    // Scores on 2026-10-09: 1 and 5 are 55.75, 2 (due today) 85, 3 (starts
    // in 20 days) 33.25, 4 (importance 7) 67.75.
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "waiting", due: day(10, 9) });
    repository.addTask({ id: 3, status: "inbox", start: day(10, 29) });
    repository.addTask({ id: 4, status: "someday", importance: 7 });
    repository.addTask({ id: 5, status: "todo" });
    repository.addTask(
      { id: 6, status: "todo", due: day(10, 9) },
      { parentId: 5 },
    );

    const read = await readAllTasks({ sort: "score" });

    expect(shape(read.tree)).toEqual([2, 4, 1, [5, [6]], 3]);
  });

  it("sorts a faded done top-level task by the same rules", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo", due: day(10, 20) });
    repository.addTask({ id: 2, status: "done", due: day(10, 12) });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });

    const read = await readAllTasks({ sort: "due" });

    expect(fades(read.tree)).toEqual([
      [2, "done"],
      [3, null],
      [1, null],
    ]);
  });

  it("by due day descending orders top-level tasks latest first, those without one still last, subtasks kept in note order", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "todo", due: day(10, 12) });
    repository.addTask({ id: 3, status: "todo", due: day(10, 20) });
    repository.addTask(
      { id: 4, status: "todo", due: day(10, 1) },
      { parentId: 3 },
    );
    repository.addTask(
      { id: 5, status: "todo", due: day(10, 30) },
      { parentId: 3 },
    );

    const read = await readAllTasks({ sort: "due", direction: "descending" });

    expect(shape(read.tree)).toEqual([[3, [4, 5]], 2, 1]);
  });

  it("by importance descending orders top-level tasks lowest first, ties still in note order", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo", importance: 6 });
    repository.addTask({ id: 2, status: "todo", importance: 2 });
    repository.addTask({ id: 3, status: "inbox", importance: 6 });
    repository.addTask({ id: 4, status: "todo", importance: 2 });

    const read = await readAllTasks({
      sort: "importance",
      direction: "descending",
    });

    expect(shape(read.tree)).toEqual([2, 4, 1, 3]);
  });

  it("by capture time descending orders top-level tasks oldest first, ties still in note order", async () => {
    const { repository, readAllTasks } = setup();
    const at = (iso: string) => new Date(iso);
    repository.addTask({
      id: 1,
      status: "todo",
      created: at("2026-10-05T09:00:00Z"),
    });
    repository.addTask({
      id: 2,
      status: "todo",
      created: at("2026-10-01T09:00:00Z"),
    });
    repository.addTask({
      id: 3,
      status: "waiting",
      created: at("2026-10-05T09:00:00Z"),
    });

    const read = await readAllTasks({
      sort: "captured",
      direction: "descending",
    });

    expect(shape(read.tree)).toEqual([2, 1, 3]);
  });

  it("by score descending orders top-level tasks lowest first, ties still in note order", async () => {
    const { repository, readAllTasks } = setup();
    // Scores on 2026-10-09, as above: 1 and 5 are 55.75, 2 is 85, 3 is
    // 33.25, 4 is 67.75.
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "waiting", due: day(10, 9) });
    repository.addTask({ id: 3, status: "inbox", start: day(10, 29) });
    repository.addTask({ id: 4, status: "someday", importance: 7 });
    repository.addTask({ id: 5, status: "todo" });

    const read = await readAllTasks({ sort: "score", direction: "descending" });

    expect(shape(read.tree)).toEqual([3, 1, 5, 4, 2]);
  });

  it("keeps note order by default", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo", importance: 1 });
    repository.addTask({ id: 2, status: "todo", due: day(10, 9) });

    expect(shape((await readAllTasks()).tree)).toEqual([1, 2]);
    expect(shape((await readAllTasks({ sort: "note" })).tree)).toEqual([1, 2]);
  });

  it("ignores the direction in note order", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "todo" });

    const read = await readAllTasks({ sort: "note", direction: "descending" });

    expect(shape(read.tree)).toEqual([1, 2]);
  });
});

/**
 * A readable completion history with one completion on each logical day
 * given (`YYYY-MM-DD`), at noon UTC+8 of that day.
 */
function completedOn(...days: string[]): {
  completionHistory: CompletionHistoryRead;
} {
  return {
    completionHistory: {
      kind: "readable",
      history: days.map((day) => {
        const [year, month, date] = day.split("-").map(Number) as [
          number,
          number,
          number,
        ];
        return {
          at: new Date(`${day}T12:00:00+08:00`),
          day: { year, month, day: date },
        };
      }),
    },
  };
}

describe("read all tasks, the done section", () => {
  it("lists a top-level task done with all its descendant tasks, once for its subtree", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" }, completedOn("2026-10-08"));
    repository.addTask(
      { id: 3, status: "done" },
      { parentId: 2, ...completedOn("2026-10-09") },
    );
    repository.addTask({ id: 4, status: "done" }, { parentId: 1 });

    const read = await readAllTasks();

    expect(doneIds(read)).toEqual([2]);
  });

  it("orders the items by their last completion, the most recent first", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "done" }, completedOn("2026-10-01"));
    // Completed twice: the later completion counts.
    repository.addTask(
      { id: 2, status: "done" },
      completedOn("2026-09-20", "2026-10-05"),
    );
    repository.addTask({ id: 3, status: "done" }, completedOn("2026-10-03"));

    const read = await readAllTasks();

    expect(doneIds(read)).toEqual([2, 3, 1]);
  });

  it("lists by default only items last completed within the last 30 logical days, today included", async () => {
    const { repository, readAllTasks } = setup();
    // Today is the logical day 2026-10-09.
    repository.addTask({ id: 1, status: "done" }, completedOn("2026-10-09"));
    // The 30th logical day back from today, counting today.
    repository.addTask({ id: 2, status: "done" }, completedOn("2026-09-10"));
    // The 31st.
    repository.addTask({ id: 3, status: "done" }, completedOn("2026-09-09"));
    // Completed long ago, then again recently: the last completion counts.
    repository.addTask(
      { id: 4, status: "done" },
      completedOn("2025-01-01", "2026-10-01"),
    );

    const read = await readAllTasks();

    expect(doneIds(read)).toEqual([1, 4, 2]);
  });

  it("goes by the logical day of the completion, not its calendar day", async () => {
    const { repository, readAllTasks } = setup();
    // 2026-09-10 02:00 in UTC+8, before the 05:00 day boundary: it fell in
    // the logical day 2026-09-09, the 31st back.
    repository.addTask(
      { id: 1, status: "done" },
      {
        completionHistory: {
          kind: "readable",
          history: [
            {
              at: new Date("2026-09-10T02:00:00+08:00"),
              day: { year: 2026, month: 9, day: 9 },
            },
          ],
        },
      },
    );

    const read = await readAllTasks();

    expect(doneIds(read)).toEqual([]);
  });

  it("lists every item when showing earlier ones, those with no completion recorded last, in note order", async () => {
    const { repository, readAllTasks } = setup();
    // Made done in Orca directly: no completion recorded.
    repository.addTask({ id: 1, status: "done" }, { position: 50 });
    repository.addTask(
      { id: 2, status: "done" },
      { position: 10, ...completedOn("2025-03-01") },
    );
    repository.addTask({ id: 3, status: "done" }, { position: 20 });
    repository.addTask(
      { id: 4, status: "done" },
      { position: 40, ...completedOn("2026-10-08") },
    );
    // A completion history this plugin cannot read counts as none.
    repository.addTask(
      { id: 5, status: "done" },
      {
        position: 30,
        completionHistory: { kind: "unreadable", reason: "version 9" },
      },
    );

    const recent = await readAllTasks();
    const all = await readAllTasks({ showEarlierDone: true });

    expect(doneIds(recent)).toEqual([4]);
    expect(doneIds(all)).toEqual([4, 2, 3, 5, 1]);
  });

  it("counts the items listed in the current range, and says whether earlier ones are left out", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "done" }, completedOn("2026-10-09"));
    repository.addTask({ id: 2, status: "done" }, completedOn("2026-10-02"));
    repository.addTask({ id: 3, status: "done" }, completedOn("2026-08-01"));
    repository.addTask({ id: 4, status: "done" });

    const recent = await readAllTasks();
    const all = await readAllTasks({ showEarlierDone: true });

    expect(recent.done.count).toBe(2);
    expect(recent.done.hasEarlier).toBe(true);
    expect(all.done.count).toBe(4);
    expect(all.done.hasEarlier).toBe(false);
  });

  it("has no earlier items when every one falls in the last 30 logical days", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" }, completedOn("2026-09-10"));

    const read = await readAllTasks();

    expect(read.done.count).toBe(1);
    expect(read.done.hasEarlier).toBe(false);
  });

  it("leaves out the kept task, which stays in its place in the tree, and does not count it", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "done" }, completedOn("2026-10-09"));
    repository.addTask({ id: 2, status: "done" }, completedOn("2026-10-08"));

    const read = await readAllTasks({ keep: 1 });

    expect(shape(read.tree)).toEqual([1]);
    expect(doneIds(read)).toEqual([2]);
    expect(read.done.count).toBe(1);
  });

  it("leaves out the done subtree a kept task sits in, its ancestor tasks showing in the tree", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "done" }, completedOn("2026-10-07"));
    repository.addTask(
      { id: 2, status: "done" },
      { parentId: 1, ...completedOn("2026-10-09") },
    );
    repository.addTask({ id: 3, status: "done" }, completedOn("2026-10-08"));

    const read = await readAllTasks({ keep: 2 });

    expect(shape(read.tree)).toEqual([[1, [2]]]);
    expect(doneIds(read)).toEqual([3]);
    expect(read.done.count).toBe(1);
  });

  it("does not count a kept task left out for being earlier as an earlier item", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "done" }, completedOn("2026-10-09"));
    repository.addTask({ id: 2, status: "done" });

    const read = await readAllTasks({ keep: 2 });

    expect(doneIds(read)).toEqual([1]);
    expect(read.done.hasEarlier).toBe(false);
  });
});

describe("read all tasks, filtered and searched", () => {
  it("by status shows only the tasks of the chosen statuses", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "waiting" });
    repository.addTask({ id: 2, status: "todo" });
    repository.addTask({ id: 3, status: "someday" });
    repository.addTask({ id: 4, status: "inbox" });

    const read = await readAllTasks({
      filter: { statuses: ["waiting", "someday"] },
    });

    expect(shape(read.tree)).toEqual([1, 3]);
  });

  it("shows the ancestor tasks of a matching task, those not matching faded as only showing where it sits", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addBlock(2, { parentId: 1 });
    repository.addTask({ id: 3, status: "waiting" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });
    repository.addTask({ id: 5, status: "waiting" }, { parentId: 4 });

    const read = await readAllTasks({ filter: { statuses: ["waiting"] } });

    expect(shape(read.tree)).toEqual([[1, [[3, [[4, [5]]]]]]]);
    expect(fades(read.tree)).toEqual([
      [1, "ancestor"],
      [3, null],
      [4, "ancestor"],
      [5, null],
    ]);
  });

  it("by contexts, labels and importance lets through any choice within a dimension, (None) for no value, and needs every dimension", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, contexts: ["home"], labels: ["q4"] });
    repository.addTask({ id: 2, contexts: [], labels: ["q4"] });
    repository.addTask({ id: 3, contexts: ["office"], labels: ["q4"] });
    repository.addTask({ id: 4, contexts: ["home"], labels: [] });
    repository.addTask({ id: 5, contexts: ["home"], labels: ["q4"] });
    repository.addTask({ id: 6, contexts: ["home"], importance: 6 });

    const read = await readAllTasks({
      filter: {
        contexts: { values: ["home"], none: true },
        labels: { values: ["q4"], none: false },
        importance: [4],
      },
    });

    // 3: another context; 4: no label; 6: another importance.
    expect(shape(read.tree)).toEqual([1, 2, 5]);
  });

  it("by search text shows the tasks whose text holds every word, whatever the case", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, text: "Call the Plumber about the sink" });
    repository.addTask({ id: 2, text: "Call mum" });
    repository.addTask({ id: 3, text: "Fix the sink" });
    repository.addTask({ id: 4, text: "SINK cabinet: call carpenter" });

    const read = await readAllTasks({ search: "  sink   CALL " });

    expect(shape(read.tree)).toEqual([1, 4]);
  });

  it("counts the matching tasks, not the ancestor tasks shown only for where they sit", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, text: "Move house" });
    repository.addTask({ id: 2, text: "Pack books" }, { parentId: 1 });
    repository.addTask({ id: 3, text: "Pack kitchen" }, { parentId: 1 });
    repository.addTask({ id: 4, text: "Pack" });

    const read = await readAllTasks({ search: "pack" });

    expect(shape(read.tree)).toEqual([[1, [2, 3]], 4]);
    expect(read.matchCount).toBe(3);
  });

  it("by status lets no done task in the tree through, a done one showing only above a matching task, others below hidden", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "waiting" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "inbox" }, { parentId: 3 });
    repository.addTask({ id: 5, status: "done" }, { parentId: 1 });
    repository.addTask({ id: 6, status: "todo" }, { parentId: 1 });

    const read = await readAllTasks({ filter: { statuses: ["waiting"] } });

    expect(shape(read.tree)).toEqual([[1, [[2, [3]]]]]);
    expect(fades(read.tree)).toEqual([
      [1, "ancestor"],
      [2, "ancestor"],
      [3, null],
    ]);
    expect(read.matchCount).toBe(1);
  });

  it("without a status filter lets a done task in the tree through by the other dimensions, still faded as done", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo", text: "Trip" });
    repository.addTask(
      { id: 2, status: "done", text: "Book trip hotel" },
      { parentId: 1 },
    );

    const read = await readAllTasks({ search: "hotel" });

    expect(fades(read.tree)).toEqual([
      [1, "ancestor"],
      [2, "done"],
    ]);
    expect(read.matchCount).toBe(1);
  });
});

describe("read all tasks, the done section filtered and searched", () => {
  it("ignores the status filter, and lets items through by the other dimensions of their own top-level task", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask(
      { id: 1, status: "done", contexts: ["home"] },
      completedOn("2026-10-09"),
    );
    repository.addTask(
      { id: 2, status: "done", contexts: ["office"] },
      completedOn("2026-10-08"),
    );
    // Only a subtask holds the context: the item itself does not.
    repository.addTask(
      { id: 3, status: "done", contexts: [] },
      completedOn("2026-10-07"),
    );
    repository.addTask(
      { id: 4, status: "done", contexts: ["home"] },
      { parentId: 3, ...completedOn("2026-10-07") },
    );

    const read = await readAllTasks({
      filter: {
        statuses: ["waiting"],
        contexts: { values: ["home"], none: false },
      },
    });

    expect(doneIds(read)).toEqual([1]);
    expect(read.done.count).toBe(1);
    expect(read.matchCount).toBe(0);
  });

  it("searches every item when there is search text, not only the last 30 logical days, and counts them all", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask(
      { id: 1, status: "done", text: "Renew passport" },
      completedOn("2026-10-08"),
    );
    repository.addTask(
      { id: 2, status: "done", text: "Passport photos" },
      completedOn("2025-03-01"),
    );
    repository.addTask({ id: 3, status: "done", text: "Old passport" });
    repository.addTask(
      { id: 4, status: "done", text: "Visa" },
      completedOn("2025-03-01"),
    );

    const read = await readAllTasks({ search: "passport" });

    expect(doneIds(read)).toEqual([1, 2, 3]);
    expect(read.done.count).toBe(3);
    expect(read.done.hasEarlier).toBe(false);
  });
});

describe("read all tasks filtered, keeping the task being viewed", () => {
  it("keeps a task no longer matching in its place, faded as kept, its ancestor tasks showing where it sits, and does not count it", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, text: "Trip" });
    repository.addBlock(2, { parentId: 1 });
    repository.addTask({ id: 3, text: "Pack" }, { parentId: 2 });
    repository.addTask({ id: 4, text: "Book hotel" }, { parentId: 3 });
    repository.addTask({ id: 5, text: "Buy socks" }, { parentId: 3 });
    repository.addTask({ id: 6, text: "Hotel loyalty card" });

    const read = await readAllTasks({ search: "hotel", keep: 3 });

    expect(shape(read.tree)).toEqual([[1, [[3, [4]]]], 6]);
    expect(fades(read.tree)).toEqual([
      [1, "ancestor"],
      [3, "kept"],
      [4, null],
      [6, null],
    ]);
    expect(read.matchCount).toBe(2);
  });
});

/** The tasks the done section lists, by ID. */
function doneIds(read: AllTasksRead): TaskId[] {
  return read.done.items.map((task) => task.id);
}

/** Every node in the tree, depth first, with whether it is marked blocked. */
function marks(nodes: readonly AllTasksNode[]): [TaskId, boolean][] {
  return nodes.flatMap((node) => [
    [node.task.id, node.blocked] as [TaskId, boolean],
    ...marks(node.children),
  ]);
}

/** Every node in the tree, depth first, with why it is faded (`null`: not). */
function fades(nodes: readonly AllTasksNode[]): [TaskId, string | null][] {
  return nodes.flatMap((node) => [
    [node.task.id, node.faded] as [TaskId, string | null],
    ...fades(node.children),
  ]);
}
