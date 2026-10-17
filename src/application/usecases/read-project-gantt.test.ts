import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { TaskId } from "../../domain/task/task";
import {
  createReadProjectGantt,
  type ProjectGanttRead,
} from "./read-project-gantt";

/** 2026-10-09 10:00 in UTC+8: the logical day 2026-10-09. */
const morning = "2026-10-09T10:00:00+08:00";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readProjectGantt = createReadProjectGantt({
    repository,
    clock: createFixedClock(morning),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, readProjectGantt };
}

/** The gantt chart of a project; fails the test for no project. */
function gantt(
  read: ProjectGanttRead,
): Extract<ProjectGanttRead, { kind: "project" }> {
  if (read.kind !== "project") throw new Error(read.kind);
  return read;
}

function day(year: number, month: number, date: number) {
  return { year, month, day: date };
}

/** Each row: its task, its depth, its parent task. */
function rows(read: ProjectGanttRead): [TaskId, number, TaskId | null][] {
  return gantt(read).gantt.rows.map((row) => [
    row.task.id,
    row.depth,
    row.parentId,
  ]);
}

describe("read project gantt, rows", () => {
  it("lists the project's tasks in note order with their depth and parent task: outside the project block too, not another project's below it", async () => {
    const { repository, readProjectGantt } = setup();
    // Set to project 1 from a journal, above the project block.
    repository.addTask({ id: 7, status: "todo" }, { project: [1] });
    repository.addTask({ id: 8, status: "todo" }, { parentId: 7 });
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "inbox" }, { parentId: 2 });
    repository.addTask({ id: 6, status: "doing" }, { parentId: 3 });
    // Under project 1's block, set to project 5: not project 1's.
    repository.addProject({ id: 5, status: "active" });
    repository.addTask(
      { id: 4, status: "todo" },
      { parentId: 1, project: [5] },
    );
    repository.addTask({ id: 10, status: "todo" }, { parentId: 1 });
    // Not the project's at all.
    repository.addTask({ id: 9, status: "todo" });

    const read = await readProjectGantt({ project: 1 });

    expect(rows(read)).toEqual([
      [7, 0, null],
      [8, 1, 7],
      [2, 0, null],
      [3, 1, 2],
      [6, 2, 3],
      [10, 0, null],
    ]);
  });
});

describe("read project gantt, bars", () => {
  it("draws a task with both dates as a bar from its start to its due date, one outside the project's dates too", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({
      id: 1,
      status: "active",
      start: day(2026, 10, 1),
      due: day(2026, 10, 31),
    });
    repository.addTask(
      {
        id: 2,
        status: "todo",
        start: day(2026, 10, 5),
        due: day(2026, 10, 12),
      },
      { parentId: 1 },
    );
    // Before the project's start, after its due date.
    repository.addTask(
      {
        id: 3,
        status: "todo",
        start: day(2026, 9, 20),
        due: day(2026, 11, 8),
      },
      { parentId: 1 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.rows.map((row) => [row.task.id, row.bar])).toEqual([
      [
        2,
        {
          kind: "bar",
          start: day(2026, 10, 5),
          due: day(2026, 10, 12),
          borrowed: "none",
        },
      ],
      [
        3,
        {
          kind: "bar",
          start: day(2026, 9, 20),
          due: day(2026, 11, 8),
          borrowed: "none",
        },
      ],
    ]);
  });

  it("draws a task with only a due date from the project's start date, the start borrowed", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({
      id: 1,
      status: "active",
      start: day(2026, 10, 1),
      due: day(2026, 10, 31),
    });
    repository.addTask(
      { id: 2, status: "todo", due: day(2026, 10, 12) },
      { parentId: 1 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.rows.map((row) => [row.task.id, row.bar])).toEqual([
      [
        2,
        {
          kind: "bar",
          start: day(2026, 10, 1),
          due: day(2026, 10, 12),
          borrowed: "start",
        },
      ],
    ]);
  });

  it("draws a task with only a start date to the project's due date, the due date borrowed", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({
      id: 1,
      status: "active",
      start: day(2026, 10, 1),
      due: day(2026, 10, 31),
    });
    repository.addTask(
      { id: 2, status: "todo", start: day(2026, 10, 20) },
      { parentId: 1 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.rows.map((row) => [row.task.id, row.bar])).toEqual([
      [
        2,
        {
          kind: "bar",
          start: day(2026, 10, 20),
          due: day(2026, 10, 31),
          borrowed: "due",
        },
      ],
    ]);
  });

  it("makes a task that cannot be drawn an unplaced task: no dates, no project date to borrow, or a borrowed date the wrong side of its own", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({
      id: 1,
      status: "active",
      start: day(2026, 10, 1),
      due: day(2026, 10, 31),
    });
    // No dates.
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    // Starting after the project's due date.
    repository.addTask(
      { id: 3, status: "todo", start: day(2026, 11, 2) },
      { parentId: 1 },
    );
    // Due before the project's start date.
    repository.addTask(
      { id: 4, status: "todo", due: day(2026, 9, 28) },
      { parentId: 1 },
    );
    repository.addProject({ id: 5, status: "active" });
    // The project has no dates to borrow.
    repository.addTask(
      { id: 6, status: "todo", start: day(2026, 10, 5) },
      { parentId: 5 },
    );
    repository.addTask(
      { id: 7, status: "todo", due: day(2026, 10, 5) },
      { parentId: 5 },
    );

    const first = gantt(await readProjectGantt({ project: 1 }));
    const second = gantt(await readProjectGantt({ project: 5 }));

    expect(first.gantt.rows.map((row) => [row.task.id, row.bar])).toEqual([
      [2, { kind: "unplaced" }],
      [3, { kind: "unplaced" }],
      [4, { kind: "unplaced" }],
    ]);
    expect(second.gantt.rows.map((row) => [row.task.id, row.bar])).toEqual([
      [6, { kind: "unplaced" }],
      [7, { kind: "unplaced" }],
    ]);
  });

  it("draws a bracket over a task that cannot be drawn but has descendant tasks on the chart, from the earliest to the latest of their bars", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({
      id: 1,
      status: "active",
      start: day(2026, 10, 1),
      due: day(2026, 10, 31),
    });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask(
      {
        id: 3,
        status: "todo",
        start: day(2026, 10, 8),
        due: day(2026, 10, 12),
      },
      { parentId: 2 },
    );
    // A bracket itself, its range from its own descendant task.
    repository.addTask({ id: 4, status: "todo" }, { parentId: 2 });
    repository.addTask(
      { id: 5, status: "todo", start: day(2026, 10, 20) },
      { parentId: 4 },
    );
    // Starting after the project's due date: unplaced, not in the range.
    repository.addTask(
      { id: 6, status: "todo", start: day(2026, 11, 3) },
      { parentId: 2 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.rows.map((row) => [row.task.id, row.bar])).toEqual([
      [2, { kind: "bracket", start: day(2026, 10, 8), due: day(2026, 10, 31) }],
      [
        3,
        {
          kind: "bar",
          start: day(2026, 10, 8),
          due: day(2026, 10, 12),
          borrowed: "none",
        },
      ],
      [
        4,
        { kind: "bracket", start: day(2026, 10, 20), due: day(2026, 10, 31) },
      ],
      [
        5,
        {
          kind: "bar",
          start: day(2026, 10, 20),
          due: day(2026, 10, 31),
          borrowed: "due",
        },
      ],
      [6, { kind: "unplaced" }],
    ]);
  });

  it("makes a task an unplaced task when neither it nor any descendant task can be drawn", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask(
      { id: 4, status: "todo", due: day(2026, 10, 12) },
      { parentId: 3 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.rows.map((row) => [row.task.id, row.bar])).toEqual([
      [2, { kind: "unplaced" }],
      [3, { kind: "unplaced" }],
      [4, { kind: "unplaced" }],
    ]);
  });

  it("leaves out a done unplaced task, keeping a done task drawn as a bar or a bracket", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "done" }, { parentId: 1 });
    repository.addTask(
      {
        id: 4,
        status: "done",
        start: day(2026, 10, 1),
        due: day(2026, 10, 3),
      },
      { parentId: 3 },
    );
    repository.addTask({ id: 5, status: "done" }, { parentId: 3 });
    repository.addTask({ id: 6, status: "todo" }, { parentId: 1 });

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.rows.map((row) => [row.task.id, row.bar.kind])).toEqual([
      [3, "bracket"],
      [4, "bar"],
      [6, "unplaced"],
    ]);
  });

  it("gives the project's start and due dates and today", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({
      id: 1,
      status: "active",
      start: day(2026, 10, 1),
      due: day(2026, 10, 31),
    });

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.projectStart).toEqual(day(2026, 10, 1));
    expect(read.gantt.projectDue).toEqual(day(2026, 10, 31));
    expect(read.gantt.today).toEqual(day(2026, 10, 9));
  });
});

describe("read project gantt, how a row stands", () => {
  it("marks a task overdue when it is not done and its due date has passed, a done one never", async () => {
    const { repository, readProjectGantt } = setup();
    // A start date to borrow, so the done task is drawn and stays (#177).
    repository.addProject({ id: 1, status: "active", start: day(2026, 9, 1) });
    // Due yesterday (today is 2026-10-09).
    repository.addTask(
      { id: 2, status: "todo", due: day(2026, 10, 8) },
      { parentId: 1 },
    );
    // Due today: not yet.
    repository.addTask(
      { id: 3, status: "doing", due: day(2026, 10, 9) },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 4, status: "done", due: day(2026, 10, 1) },
      { parentId: 1 },
    );
    repository.addTask({ id: 5, status: "todo" }, { parentId: 1 });

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.rows.map((row) => [row.task.id, row.overdue])).toEqual([
      [2, true],
      [3, false],
      [4, false],
      [5, false],
    ]);
  });
});

describe("read project gantt, blocked", () => {
  it("marks a task blocked as the board does: by a dependency, not by its subtasks", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    // Waits for task 2.
    repository.addTask(
      { id: 3, status: "todo", dependencies: [2] },
      { parentId: 1 },
    );
    // Held back only by its open subtask.
    repository.addTask({ id: 4, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 5, status: "todo" }, { parentId: 4 });
    // Waiting: not marked, as on the board.
    repository.addTask(
      { id: 6, status: "waiting", dependencies: [2] },
      { parentId: 1 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.rows.map((row) => [row.task.id, row.blocked])).toEqual([
      [2, false],
      [3, true],
      [4, false],
      [5, false],
      [6, false],
    ]);
  });
});

describe("read project gantt, held back", () => {
  it("gives the stretch an ancestor task's later start holds back: from the task's own start to the effective start", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", start: day(2026, 10, 12) },
      { parentId: 1 },
    );
    repository.addTask(
      {
        id: 3,
        status: "todo",
        start: day(2026, 10, 5),
        due: day(2026, 10, 20),
      },
      { parentId: 2 },
    );
    // Starts after its parent task: nothing held back.
    repository.addTask(
      {
        id: 4,
        status: "todo",
        start: day(2026, 10, 14),
        due: day(2026, 10, 20),
      },
      { parentId: 2 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.rows.map((row) => [row.task.id, row.heldBack])).toEqual([
      [2, null],
      [3, { from: day(2026, 10, 5), until: day(2026, 10, 12) }],
      [4, null],
    ]);
  });

  it("gives the stretch the project's later start holds back", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({
      id: 1,
      status: "active",
      start: day(2026, 10, 10),
    });
    repository.addTask(
      {
        id: 2,
        status: "todo",
        start: day(2026, 10, 1),
        due: day(2026, 10, 15),
      },
      { parentId: 1 },
    );
    // No start of its own: nothing of its own held back.
    repository.addTask(
      { id: 3, status: "todo", due: day(2026, 10, 15) },
      { parentId: 1 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.rows.map((row) => [row.task.id, row.heldBack])).toEqual([
      [2, { from: day(2026, 10, 1), until: day(2026, 10, 10) }],
      [3, null],
    ]);
  });
});

describe("read project gantt, filtered and searched", () => {
  it("keeps a row when its task or any descendant task is found, in note order", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", text: "Plan" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, status: "todo", text: "Draft" },
      { parentId: 2 },
    );
    repository.addTask(
      { id: 4, status: "todo", text: "Call printer" },
      { parentId: 3 },
    );
    repository.addTask(
      { id: 5, status: "todo", text: "Budget" },
      { parentId: 2 },
    );
    repository.addTask(
      { id: 6, status: "todo", text: "Venue" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 7, status: "todo", text: "Call venue" },
      { parentId: 1 },
    );

    const read = await readProjectGantt({ project: 1, search: "call" });

    expect(rows(read)).toEqual([
      [2, 0, null],
      [3, 1, 2],
      [4, 2, 3],
      [7, 0, null],
    ]);
  });

  it("narrows by the filter as the tree does, the status filter too", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "doing" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "waiting" }, { parentId: 1 });
    repository.addTask({ id: 5, status: "done" }, { parentId: 1 });

    const read = await readProjectGantt({
      project: 1,
      filter: { statuses: ["doing"] },
    });

    expect(rows(read)).toEqual([
      [2, 0, null],
      [3, 1, 2],
    ]);
  });
});

describe("read project gantt, no project", () => {
  it("reads no project for a block that is not a project", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addBlock(2);

    expect(await readProjectGantt({ project: 1 })).toEqual({
      kind: "noProject",
    });
    expect(await readProjectGantt({ project: 2 })).toEqual({
      kind: "noProject",
    });
  });

  it("reads no project while the project tag is paused", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.pauseProjectTag(true);

    expect(await readProjectGantt({ project: 1 })).toEqual({
      kind: "noProject",
    });
  });

  it("brings the project as the project details' attribute area shows it", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, text: "Move house", status: "active" });
    repository.addTask({ id: 2, status: "done", effort: 2 }, { parentId: 1 });
    repository.addTask({ id: 3, status: "inbox", effort: 6 }, { parentId: 1 });

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.project.project.text).toBe("Move house");
    expect(read.project.progress).toEqual({
      kind: "measured",
      done: 2,
      total: 8,
    });
  });
});

describe("read project gantt, dependencies", () => {
  it("gives a row its dependencies on the project's tasks, from the task depended on to it, with its dependency delay", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    // Dated, so the done task is drawn and stays (#177).
    repository.addTask(
      {
        id: 2,
        status: "done",
        start: day(2026, 10, 1),
        due: day(2026, 10, 3),
      },
      { parentId: 1 },
    );
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask(
      { id: 4, status: "todo", dependencies: [3, 2], dependencyDelay: 2 },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 5, status: "todo", dependencies: [4] },
      { parentId: 1 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(
      read.gantt.rows.map((row) => [row.task.id, row.dependencies]),
    ).toEqual([
      [2, []],
      [3, []],
      [
        4,
        [
          { from: 3, to: 4, delay: 2 },
          { from: 2, to: 4, delay: 2 },
        ],
      ],
      [5, [{ from: 4, to: 5, delay: 0 }]],
    ]);
  });

  it("marks a dependency on a task outside the project with the task's text, not as an arrow; a stale one not at all", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addProject({ id: 5, status: "active" });
    repository.addTask(
      { id: 6, status: "todo", text: "Sign the lease" },
      { parentId: 5 },
    );
    repository.addTask({ id: 7, status: "done", text: "Ask Wang" });
    // Not a task any more: a stale dependency.
    repository.addBlock(8);
    repository.addTask(
      { id: 2, status: "todo", dependencies: [6, 8, 9, 7] },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, status: "todo", dependencies: [2] },
      { parentId: 1 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(
      read.gantt.rows.map((row) => [
        row.task.id,
        row.dependencies,
        row.outsideDependencies,
      ]),
    ).toEqual([
      [
        2,
        [],
        [
          { task: 6, text: "Sign the lease" },
          { task: 7, text: "Ask Wang" },
        ],
      ],
      [3, [{ from: 2, to: 3, delay: 0 }], []],
    ]);
  });

  it("gives no dependency for doing subtasks one after another", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", sequential: true },
      { parentId: 1 },
    );
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 2 });

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(
      read.gantt.rows.flatMap((row) => [
        ...row.dependencies,
        ...row.outsideDependencies,
      ]),
    ).toEqual([]);
  });
});
