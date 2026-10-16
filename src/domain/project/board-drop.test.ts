import { describe, expect, it } from "vitest";
import type { TaskId } from "../task/task";
import { boardDrop, boardStatusDrop } from "./board-drop";

describe("boardStatusDrop", () => {
  it("changes the status to the column's when the task is in another status", () => {
    expect(boardStatusDrop("todo", "doing")).toEqual({
      kind: "status",
      status: "doing",
    });
  });

  it("writes nothing when the task already has the column's status", () => {
    expect(boardStatusDrop("waiting", "waiting")).toBeNull();
  });

  it("changes a done task back to an open status", () => {
    expect(boardStatusDrop("done", "inbox")).toEqual({
      kind: "status",
      status: "inbox",
    });
  });
});

describe("boardDrop", () => {
  // 1 ─ 2 ─ 3, and 4 apart; 1 is a root task (its parent off the board).
  const parents = new Map<TaskId, TaskId | null>([
    [1, null],
    [2, 1],
    [3, 2],
    [4, null],
  ]);
  const parentOf = (id: TaskId) => parents.get(id) ?? null;

  it("makes the task the last subtask of the card or row it is dropped on", () => {
    expect(
      boardDrop(
        { id: 4, status: "todo" },
        { task: 2, column: "todo" },
        parentOf,
      ),
    ).toEqual({ kind: "lastChild", target: 2 });
  });

  it("falls back to the column on the task itself: its row in a card of another status changes its status", () => {
    expect(
      boardDrop(
        { id: 3, status: "doing" },
        { task: 3, column: "todo" },
        parentOf,
      ),
    ).toEqual({ kind: "status", status: "todo" });
  });

  it("falls back to the column on one of its descendant tasks", () => {
    expect(
      boardDrop(
        { id: 1, status: "todo" },
        { task: 3, column: "todo" },
        parentOf,
      ),
    ).toBeNull();
    expect(
      boardDrop(
        { id: 1, status: "doing" },
        { task: 3, column: "todo" },
        parentOf,
      ),
    ).toEqual({ kind: "status", status: "todo" });
  });

  it("falls back to the column on its parent task: a row dropped back on its card does not move", () => {
    expect(
      boardDrop(
        { id: 3, status: "todo" },
        { task: 2, column: "todo" },
        parentOf,
      ),
    ).toBeNull();
    expect(
      boardDrop(
        { id: 2, status: "todo" },
        { task: 1, column: "doing" },
        parentOf,
      ),
    ).toEqual({ kind: "status", status: "doing" });
  });

  it("makes a subtask the last subtask of a task higher up than its parent task", () => {
    expect(
      boardDrop(
        { id: 3, status: "todo" },
        { task: 1, column: "todo" },
        parentOf,
      ),
    ).toEqual({ kind: "lastChild", target: 1 });
  });

  it("is no drop off a column and off a card", () => {
    expect(boardDrop({ id: 4, status: "todo" }, {}, parentOf)).toBeNull();
  });

  it("moves the task to the end of the project block on the project root drop, its status unchanged (#170)", () => {
    expect(
      boardDrop({ id: 3, status: "doing" }, { projectEnd: true }, parentOf),
    ).toEqual({ kind: "projectEnd" });
  });
});
