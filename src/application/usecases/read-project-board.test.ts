import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { TaskId, TaskStatus } from "../../domain/task/task";
import type { CompletionHistoryRead } from "../ports/task-repository";
import {
  createReadProjectBoard,
  type ProjectBoardRead,
  type RootBoard,
  type StatusBoard,
  type StatusColumn,
} from "./read-project-board";

/** 2026-10-09 10:00 in UTC+8: the logical day 2026-10-09. */
const morning = "2026-10-09T10:00:00+08:00";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readProjectBoard = createReadProjectBoard({
    repository,
    clock: createFixedClock(morning),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, readProjectBoard };
}

/** The board of a project; fails the test for no project. */
function board(
  read: ProjectBoardRead,
): Extract<ProjectBoardRead, { kind: "project" }> {
  if (read.kind !== "project") throw new Error(read.kind);
  return read;
}

/** The board by status; fails the test for another grouping. */
function byStatus(read: ProjectBoardRead): StatusBoard {
  const found = board(read).board;
  if (found.grouping !== "status") throw new Error(found.grouping);
  return found;
}

/** The board by project root task; fails the test for another grouping. */
function byRoot(read: ProjectBoardRead): RootBoard {
  const found = board(read).board;
  if (found.grouping !== "root") throw new Error(found.grouping);
  return found;
}

/** Each column of a board by project root task: its head's task, its cards. */
function rootColumns(read: ProjectBoardRead): [TaskId, TaskId[]][] {
  return byRoot(read).columns.map((col) => [
    col.head.task.id,
    col.cards.map((card) => card.task.id),
  ]);
}

/** The column of `status`; fails the test without one. */
function column(read: ProjectBoardRead, status: TaskStatus): StatusColumn {
  const found = byStatus(read).columns.find((col) => col.status === status);
  if (!found) throw new Error(`no column ${status}`);
  return found;
}

/** The task IDs of a column's cards, in order. */
function cardIds(read: ProjectBoardRead, status: TaskStatus): TaskId[] {
  return column(read, status).cards.map((card) => card.task.id);
}

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

describe("read project board, by status", () => {
  it("has the six status columns in a fixed order, each with its count, empty ones kept", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "inbox" }, { parentId: 1 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 5, status: "waiting" }, { parentId: 1 });

    const read = byStatus(await readProjectBoard({ project: 1 }));

    expect(read.columns.map((col) => [col.status, col.count])).toEqual([
      ["inbox", 1],
      ["todo", 2],
      ["doing", 0],
      ["waiting", 1],
      ["someday", 0],
      ["done", 0],
    ]);
  });

  it("makes cards only of project root tasks: outside the project block too, not another project's below it", async () => {
    const { repository, readProjectBoard } = setup();
    // Set to project 1 from a journal, above the project block.
    repository.addTask({ id: 7, status: "todo" }, { project: [1] });
    repository.addTask({ id: 8, status: "todo" }, { parentId: 7 });
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    // A descendant task of a root: no card of its own.
    repository.addTask({ id: 3, status: "inbox" }, { parentId: 2 });
    // Under project 1's block, set to project 5: not project 1's.
    repository.addProject({ id: 5, status: "active" });
    repository.addTask(
      { id: 4, status: "todo" },
      { parentId: 1, project: [5] },
    );
    // Not the project's at all.
    repository.addTask({ id: 9, status: "todo" });

    const read = await readProjectBoard({ project: 1 });

    expect(cardIds(read, "todo")).toEqual([7, 2]);
    expect(cardIds(read, "inbox")).toEqual([]);
  });

  it("shows a card's parent task text when its parent task is not the project's", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 4, text: "Errands", status: "todo" });
    repository.addTask(
      { id: 5, status: "todo" },
      { parentId: 4, project: [1] },
    );

    const read = await readProjectBoard({ project: 1 });

    expect(
      column(read, "todo").cards.map((card) => [card.task.id, card.parentText]),
    ).toEqual([
      [2, null],
      [5, "Errands"],
    ]);
  });

  it("gives each card and each row its parent task, for a drop on them", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });
    // Written outside the project block.
    repository.addTask({ id: 5, status: "todo" }, { project: [1] });

    const read = await readProjectBoard({ project: 1, sort: "note" });

    expect(
      column(read, "todo").cards.map((card) => [
        card.task.id,
        card.parentId,
        card.rows.map((row) => [row.task.id, row.parentId]),
      ]),
    ).toEqual([
      // A project block is no parent task.
      [
        2,
        null,
        [
          [3, 2],
          [4, 3],
        ],
      ],
      [5, null, []],
    ]);
  });

  it("orders each column's cards by score by default, highest first, ties in note order", async () => {
    const { repository, readProjectBoard } = setup();
    const day = (d: number) => ({ year: 2026, month: 10, day: d });
    // Scores on 2026-10-09: 2 and 5 are 54.75, 3 (due today) 77.5, 4
    // (importance 7) 64.75.
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo", due: day(9) }, { parentId: 1 });
    repository.addTask(
      { id: 4, status: "todo", importance: 7 },
      { parentId: 1 },
    );
    repository.addTask({ id: 5, status: "todo" }, { parentId: 1 });

    const read = await readProjectBoard({ project: 1 });

    expect(cardIds(read, "todo")).toEqual([3, 4, 2, 5]);
  });

  it("orders cards by another sort and direction when asked, those without the day last", async () => {
    const { repository, readProjectBoard } = setup();
    const day = (d: number) => ({ year: 2026, month: 10, day: d });
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask(
      { id: 3, status: "todo", due: day(20) },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 4, status: "todo", due: day(12) },
      { parentId: 1 },
    );

    const due = await readProjectBoard({ project: 1, sort: "due" });
    const note = await readProjectBoard({ project: 1, sort: "note" });
    const latest = await readProjectBoard({
      project: 1,
      sort: "due",
      direction: "descending",
    });

    expect(cardIds(due, "todo")).toEqual([4, 3, 2]);
    expect(cardIds(note, "todo")).toEqual([2, 3, 4]);
    expect(cardIds(latest, "todo")).toEqual([3, 4, 2]);
  });

  it("orders done cards by their last completion, most recent first, whatever the sort", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "done", importance: 7 },
      { parentId: 1, ...completedOn("2026-10-01") },
    );
    // Completed twice: the later completion counts.
    repository.addTask(
      { id: 3, status: "done" },
      { parentId: 1, ...completedOn("2026-09-20", "2026-10-05") },
    );
    repository.addTask(
      { id: 4, status: "done" },
      { parentId: 1, ...completedOn("2026-10-03") },
    );

    const read = await readProjectBoard({ project: 1, sort: "importance" });

    expect(cardIds(read, "done")).toEqual([3, 4, 2]);
  });

  it("splits the done cards into the last 30 logical days and earlier ones, those with no completion recorded earlier, in note order", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    // Made done in Orca directly: no completion recorded.
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });
    // The 30th logical day back from today (2026-10-09), counting today.
    repository.addTask(
      { id: 3, status: "done" },
      { parentId: 1, ...completedOn("2026-09-10") },
    );
    // The 31st.
    repository.addTask(
      { id: 4, status: "done" },
      { parentId: 1, ...completedOn("2026-09-09") },
    );
    repository.addTask(
      { id: 5, status: "done" },
      { parentId: 1, ...completedOn("2026-10-09") },
    );
    repository.addTask({ id: 6, status: "done" }, { parentId: 1 });

    const read = await readProjectBoard({ project: 1 });

    const done = column(read, "done");
    expect(done.cards.map((card) => card.task.id)).toEqual([5, 3]);
    expect(done.earlier.map((card) => card.task.id)).toEqual([4, 2, 6]);
    expect(done.count).toBe(5);
  });

  it("marks a card blocked by a dependency, not by its subtasks alone", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask(
      { id: 3, status: "doing", dependencies: [2] },
      { parentId: 1 },
    );
    // Held back only by its subtask: not marked.
    repository.addTask({ id: 4, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 5, status: "todo" }, { parentId: 4 });
    // Waiting is never marked.
    repository.addTask(
      { id: 6, status: "waiting", dependencies: [2] },
      { parentId: 1 },
    );

    const read = await readProjectBoard({ project: 1, sort: "note" });

    const marks = byStatus(read).columns.flatMap((col) =>
      col.cards.map((card) => [card.task.id, card.blocked]),
    );
    expect(marks).toEqual([
      [2, false],
      [4, false],
      [3, true],
      [6, false],
    ]);
  });

  it("counts a card's direct subtasks, done and in all, not deeper descendant tasks", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 2 });
    // Deeper: not counted.
    repository.addTask({ id: 5, status: "done" }, { parentId: 4 });
    repository.addTask({ id: 6, status: "someday" }, { parentId: 2 });
    // No subtasks.
    repository.addTask({ id: 7, status: "todo" }, { parentId: 1 });

    const read = await readProjectBoard({ project: 1, sort: "note" });

    expect(
      column(read, "todo").cards.map((card) => [card.task.id, card.subtasks]),
    ).toEqual([
      [2, { done: 1, total: 3 }],
      [7, { done: 0, total: 0 }],
    ]);
  });

  it("counts the doing tasks and the next actions among a card's descendant tasks, at any depth", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    // Doing, held back by its own subtask: doing, not a next action.
    repository.addTask({ id: 3, status: "doing" }, { parentId: 2 });
    // Two levels down: a next action.
    repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });
    // Doing and a next action: counted in both.
    repository.addTask({ id: 5, status: "doing" }, { parentId: 2 });
    repository.addTask({ id: 6, status: "done" }, { parentId: 2 });
    // The card itself is not its own descendant task.
    repository.addTask({ id: 7, status: "doing" }, { parentId: 1 });

    const read = await readProjectBoard({ project: 1, sort: "note" });

    const counts = byStatus(read).columns.flatMap((col) =>
      col.cards.map((card) => [card.task.id, card.descendants]),
    );
    expect(counts).toEqual([
      [2, { doing: 2, nextActions: 2 }],
      [7, { doing: 0, nextActions: 0 }],
    ]);
  });

  it("lists a card's descendant tasks as rows in note order, whatever the sort, each with its depth, blocked mark and next action mark", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });
    // Blocked by a dependency on 4.
    repository.addTask(
      { id: 5, status: "todo", importance: 7, dependencies: [4] },
      { parentId: 2 },
    );
    repository.addTask({ id: 6, status: "done" }, { parentId: 5 });

    const read = await readProjectBoard({ project: 1, sort: "importance" });

    const [card] = column(read, "todo").cards;
    expect(
      card?.rows.map((row) => [
        row.task.id,
        row.depth,
        row.blocked,
        row.nextAction,
      ]),
    ).toEqual([
      [3, 0, false, false],
      [4, 1, false, true],
      [5, 0, true, false],
      [6, 1, false, false],
    ]);
  });

  it("reads no project for a block that is not a project", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addBlock(2);

    expect(await readProjectBoard({ project: 1 })).toEqual({
      kind: "noProject",
    });
    expect(await readProjectBoard({ project: 2 })).toEqual({
      kind: "noProject",
    });
  });

  it("reads no project while the project tag is paused", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.pauseProjectTag(true);

    expect(await readProjectBoard({ project: 1 })).toEqual({
      kind: "noProject",
    });
  });

  it("brings the project as the project details' attribute area shows it", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, text: "Move house", status: "active" });
    repository.addTask({ id: 2, status: "done", effort: 2 }, { parentId: 1 });
    repository.addTask({ id: 3, status: "inbox", effort: 6 }, { parentId: 1 });

    const read = board(await readProjectBoard({ project: 1 }));

    expect(read.project.project.text).toBe("Move house");
    expect(read.project.progress).toEqual({
      kind: "measured",
      done: 2,
      total: 8,
    });
    expect(read.project.noNextAction).toBe(true);
  });
});

describe("read project board, by project root task (#171)", () => {
  it('gives each project root task with subtasks a column in note order, its direct subtasks the cards, the others in "Other"', async () => {
    const { repository, readProjectBoard } = setup();
    // Set to project 1 from a journal, above the project block.
    repository.addTask({ id: 7, status: "todo" }, { project: [1] });
    repository.addTask({ id: 8, status: "todo" }, { parentId: 7 });
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    // Deeper: folded in card 3, no card of its own.
    repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });
    // No subtasks: in "Other".
    repository.addTask({ id: 5, status: "inbox" }, { parentId: 1 });
    repository.addTask({ id: 6, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 9, status: "doing" }, { parentId: 6 });
    // Not the project's at all.
    repository.addTask({ id: 10, status: "todo" });

    const read = await readProjectBoard({
      project: 1,
      grouping: "root",
      sort: "note",
    });

    expect(byRoot(read).other.cards.map((card) => card.task.id)).toEqual([5]);
    expect(rootColumns(read)).toEqual([
      [7, [8]],
      [2, [3]],
      [6, [9]],
    ]);
  });

  it("orders each column's open cards by the sort, its done ones apart, all of them, by their last completion, most recent first", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask(
      { id: 3, status: "todo", importance: 1 },
      { parentId: 2 },
    );
    repository.addTask(
      { id: 4, status: "done", importance: 7 },
      { parentId: 2, ...completedOn("2026-10-01") },
    );
    repository.addTask(
      { id: 5, status: "todo", importance: 5 },
      { parentId: 2 },
    );
    // Long ago: still among them, no 30 days.
    repository.addTask(
      { id: 6, status: "done" },
      { parentId: 2, ...completedOn("2026-03-01") },
    );
    repository.addTask(
      { id: 7, status: "done" },
      { parentId: 2, ...completedOn("2026-10-08") },
    );
    // "Other" likewise.
    repository.addTask(
      { id: 8, status: "done" },
      { parentId: 1, ...completedOn("2026-01-01") },
    );
    repository.addTask(
      { id: 9, status: "done" },
      { parentId: 1, ...completedOn("2026-10-02") },
    );
    repository.addTask({ id: 10, status: "inbox" }, { parentId: 1 });

    const read = byRoot(
      await readProjectBoard({
        project: 1,
        grouping: "root",
        sort: "importance",
      }),
    );

    expect(read.columns[0]?.cards.map((card) => card.task.id)).toEqual([5, 3]);
    expect(read.columns[0]?.done.map((card) => card.task.id)).toEqual([
      7, 4, 6,
    ]);
    expect(read.other.cards.map((card) => card.task.id)).toEqual([10]);
    expect(read.other.done.map((card) => card.task.id)).toEqual([9, 8]);
  });

  it("marks a column finished when its project root task and all its descendant tasks are done, after every other column", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    // Finished, deeper ones too.
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "done" }, { parentId: 3 });
    // Done, a descendant task not: not finished.
    repository.addTask({ id: 5, status: "done" }, { parentId: 1 });
    repository.addTask({ id: 6, status: "done" }, { parentId: 5 });
    repository.addTask({ id: 7, status: "todo" }, { parentId: 6 });
    // Its subtasks done, itself not: not finished.
    repository.addTask({ id: 8, status: "doing" }, { parentId: 1 });
    repository.addTask({ id: 9, status: "done" }, { parentId: 8 });

    const read = await readProjectBoard({ project: 1, grouping: "root" });

    expect(
      byRoot(read).columns.map((col) => [col.head.task.id, col.finished]),
    ).toEqual([
      [5, false],
      [8, false],
      [2, true],
    ]);
  });

  it("heads a column with its project root task: its lock and its direct subtasks done and in all", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 9, status: "todo" }, { parentId: 1 });
    repository.addTask(
      { id: 2, status: "todo", dependencies: [9] },
      { parentId: 1 },
    );
    repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 2 });
    // Deeper: not counted.
    repository.addTask({ id: 5, status: "done" }, { parentId: 4 });
    // Held back only by its subtask: no lock.
    repository.addTask({ id: 6, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 7, status: "todo" }, { parentId: 6 });

    const read = await readProjectBoard({ project: 1, grouping: "root" });

    expect(
      byRoot(read).columns.map((col) => [
        col.head.task.id,
        col.head.blocked,
        col.head.subtasks,
      ]),
    ).toEqual([
      [2, true, { done: 1, total: 2 }],
      [6, false, { done: 0, total: 1 }],
    ]);
  });

  it("shows no parent task text on a column's cards, the column head their parent task; in \"Other\" a project root task's parent task not the project's still shows", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, text: "Launch", status: "todo" },
      { parentId: 1 },
    );
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, text: "Errands", status: "todo" });
    repository.addTask(
      { id: 5, status: "todo" },
      { parentId: 4, project: [1] },
    );

    const read = byRoot(
      await readProjectBoard({ project: 1, grouping: "root" }),
    );

    expect(
      read.columns[0]?.cards.map((card) => [card.task.id, card.parentText]),
    ).toEqual([[3, null]]);
    expect(
      read.other.cards.map((card) => [card.task.id, card.parentText]),
    ).toEqual([[5, "Errands"]]);
  });

  it('brings a project root task back to "Other" once its last subtask is moved away', async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 1 });

    await repository.moveTask(3, 4, "lastChild");
    const read = await readProjectBoard({ project: 1, grouping: "root" });

    expect(byRoot(read).other.cards.map((card) => card.task.id)).toEqual([2]);
    expect(rootColumns(read)).toEqual([[4, [3]]]);
  });
});

describe("read project board, filtered and searched (#172)", () => {
  it("keeps a card when it or any descendant task is found, its rows only what is found and the tasks above it", async () => {
    const { repository, readProjectBoard } = setup();
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

    const read = await readProjectBoard({
      project: 1,
      sort: "note",
      search: "call",
    });

    expect(cardIds(read, "todo")).toEqual([2, 7]);
    expect(
      column(read, "todo").cards[0]?.rows.map((row) => [
        row.task.id,
        row.depth,
      ]),
    ).toEqual([
      [3, 0],
      [4, 1],
    ]);
  });

  it("narrows only a card's rows, not its counts: subtasks and the collapsed card's doing ones stay those of every descendant task", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", text: "Plan" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, status: "todo", text: "Call printer" },
      { parentId: 2 },
    );
    repository.addTask(
      { id: 4, status: "doing", text: "Budget" },
      { parentId: 2 },
    );

    const read = await readProjectBoard({ project: 1, search: "call" });

    const card = column(read, "todo").cards[0];
    expect(card?.rows.map((row) => row.task.id)).toEqual([3]);
    expect(card?.subtasks).toEqual({ done: 0, total: 2 });
    expect(card?.descendants.doing).toBe(1);
  });

  it("gives a card found by itself, none of its descendant tasks found, no rows while still counting its subtasks", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", text: "Call printer" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, status: "done", text: "Draft" },
      { parentId: 2 },
    );
    repository.addTask(
      { id: 4, status: "todo", text: "Budget" },
      { parentId: 2 },
    );

    const read = await readProjectBoard({ project: 1, search: "call" });

    const card = column(read, "todo").cards[0];
    expect(card?.rows).toEqual([]);
    expect(card?.subtasks).toEqual({ done: 1, total: 2 });
  });

  it("by status lets the status filter choose only the columns, not the cards, a chosen one shown even empty; the done column, not offered by it, stays", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    // A todo card whose subtasks are of other statuses: kept whole.
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "inbox" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "waiting" }, { parentId: 2 });
    repository.addTask({ id: 5, status: "inbox" }, { parentId: 1 });
    repository.addTask({ id: 6, status: "doing" }, { parentId: 1 });
    repository.addTask(
      { id: 7, status: "done" },
      { parentId: 1, ...completedOn("2026-10-08") },
    );

    const read = await readProjectBoard({
      project: 1,
      sort: "note",
      // No project root task waits: 4 is a subtask.
      filter: { statuses: ["todo", "doing", "waiting"] },
    });

    expect(
      byStatus(read).columns.map((col) => [
        col.status,
        col.cards.map((card) => card.task.id),
      ]),
    ).toEqual([
      ["todo", [2]],
      ["doing", [6]],
      ["waiting", []],
      ["done", [7]],
    ]);
    expect(
      column(read, "todo").cards[0]?.rows.map((row) => row.task.id),
    ).toEqual([3, 4]);
  });

  it("by status keeps every column while narrowed, empty ones too, the counts those found; searching lifts the done column's 30 days, as the done section's", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", text: "Call A" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, status: "todo", text: "Write" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 4, status: "inbox", text: "Read" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 5, status: "done", text: "Call B" },
      { parentId: 1, ...completedOn("2026-01-08") },
    );

    const read = await readProjectBoard({ project: 1, search: "call" });

    expect(
      byStatus(read).columns.map((col) => [
        col.status,
        col.count,
        col.cards.map((card) => card.task.id),
        col.earlier.map((card) => card.task.id),
      ]),
    ).toEqual([
      ["inbox", 0, [], []],
      ["todo", 1, [2], []],
      ["doing", 0, [], []],
      ["waiting", 0, [], []],
      ["someday", 0, [], []],
      ["done", 1, [5], []],
    ]);
  });

  it("by project root task narrows the cards by the status filter too, a column shown when its project root task passes (every card then) or a card in it does", async () => {
    const { repository, readProjectBoard } = setup();
    repository.addProject({ id: 1, status: "active" });
    // Its root passes: the whole column.
    repository.addTask({ id: 2, status: "doing" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "inbox" }, { parentId: 2 });
    // A card passes by a descendant task: only that card.
    repository.addTask({ id: 5, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 6, status: "inbox" }, { parentId: 5 });
    repository.addTask({ id: 7, status: "todo" }, { parentId: 6 });
    repository.addTask({ id: 8, status: "doing" }, { parentId: 7 });
    repository.addTask({ id: 9, status: "todo" }, { parentId: 5 });
    // Nothing in it passes: no column.
    repository.addTask({ id: 10, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 11, status: "inbox" }, { parentId: 10 });
    // "Other": only those passing.
    repository.addTask({ id: 12, status: "doing" }, { parentId: 1 });
    repository.addTask({ id: 13, status: "todo" }, { parentId: 1 });

    const read = await readProjectBoard({
      project: 1,
      grouping: "root",
      sort: "note",
      filter: { statuses: ["doing"] },
    });

    expect(byRoot(read).other.cards.map((card) => card.task.id)).toEqual([12]);
    expect(rootColumns(read)).toEqual([
      [2, [3, 4]],
      [5, [6]],
    ]);
    // Its rows: the doing one and the tasks above it.
    expect(
      byRoot(read).columns[1]?.cards[0]?.rows.map((row) => row.task.id),
    ).toEqual([7, 8]);
  });
});
