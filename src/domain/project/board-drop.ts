// What a drop on the project board writes (ROADMAP step 11 phase 4). Grouped
// by status, a drop in a column changes the task to the column's status and
// moves no block (#168); a drop on a card or a subtask row makes the task the
// target's last subtask, its status unchanged (#169), with the tree's
// lastChild move. On itself, one of its descendant tasks or its parent task
// a card or a row is no place to drop: the drop falls back to the column it
// is in, and a drop back in the task's own column is no drop at all: it
// writes nothing and nothing is highlighted. One drop makes one write. Pure.
import type { TaskId, TaskStatus } from "../task/task";

/** The single write a board drop makes. */
export type BoardDrop =
  | { readonly kind: "status"; readonly status: TaskStatus }
  | { readonly kind: "lastChild"; readonly target: TaskId };

/**
 * A task with status `current` dropped in the column of status `column`:
 * the status change, or `null` when it is already in that column.
 */
export function boardStatusDrop(
  current: TaskStatus,
  column: TaskStatus,
): BoardDrop | null {
  return current === column ? null : { kind: "status", status: column };
}

/** Where on the board a drop is let go. */
export interface BoardDropPoint {
  /** The task of the card or the subtask row under it, if any. */
  readonly task?: TaskId;
  /** The status of the column it is in, if any. */
  readonly column?: TaskStatus;
}

/**
 * Task `dragged` dropped at `point`: the write, or `null` for none.
 * `parentOf` gives a task's parent task (`null`: none, or not known).
 */
export function boardDrop(
  dragged: { readonly id: TaskId; readonly status: TaskStatus },
  point: BoardDropPoint,
  parentOf: (id: TaskId) => TaskId | null,
): BoardDrop | null {
  if (
    point.task !== undefined &&
    takesSubtask(dragged.id, point.task, parentOf)
  ) {
    return { kind: "lastChild", target: point.task };
  }
  return point.column === undefined
    ? null
    : boardStatusDrop(dragged.status, point.column);
}

/** Task `target` can take task `id` as its last subtask on the board. */
function takesSubtask(
  id: TaskId,
  target: TaskId,
  parentOf: (id: TaskId) => TaskId | null,
): boolean {
  // Its parent task already has it.
  if (parentOf(id) === target) return false;
  // Itself, or one of its descendant tasks: `id` is on the way up.
  const seen = new Set<TaskId>();
  for (
    let current: TaskId | null = target;
    current !== null && !seen.has(current);
    current = parentOf(current)
  ) {
    if (current === id) return false;
    seen.add(current);
  }
  return true;
}
