// What a drop on the project board writes (ROADMAP step 11 phase 4). Grouped
// by status, a drop in a column changes the task to the column's status and
// moves no block (#168); a drop on a card or a subtask row makes the task the
// target's last subtask, its status unchanged (#169), with the tree's
// lastChild move. On itself, one of its descendant tasks or its parent task
// a card or a row is no place to drop: the drop falls back to the column it
// is in, and a drop back in the task's own column is no drop at all: it
// writes nothing and nothing is highlighted. Grouped by project root task
// (#171), a drop in a project root task's column makes the task its last
// subtask, and a drop in "Other" moves it to the end of the project block, a
// project root task; a task already there is no drop. One drop makes one
// write. Pure.
import type { TaskId, TaskStatus } from "../task/task";

/** The single write a board drop makes. */
export type BoardDrop =
  | { readonly kind: "status"; readonly status: TaskStatus }
  | { readonly kind: "lastChild"; readonly target: TaskId }
  /** To the end of the project block, a project root task (#170). */
  | { readonly kind: "projectEnd" };

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
  /**
   * On the "As root task" drop (#170), shown only while a task that is not
   * a project root task is dragged.
   */
  readonly projectEnd?: boolean;
  /**
   * By project root task (#171): the project root task whose column it is
   * in, if any.
   */
  readonly root?: TaskId;
  /** By project root task (#171): in the "Other" column. */
  readonly other?: boolean;
}

/**
 * Task `dragged` dropped at `point`: the write, or `null` for none.
 * `dragged.projectRoot`: it is a project root task already (#171).
 * `parentOf` gives a task's parent task (`null`: none, or not known).
 */
export function boardDrop(
  dragged: {
    readonly id: TaskId;
    readonly status: TaskStatus;
    readonly projectRoot?: boolean;
  },
  point: BoardDropPoint,
  parentOf: (id: TaskId) => TaskId | null,
): BoardDrop | null {
  if (point.projectEnd) return { kind: "projectEnd" };
  if (
    point.task !== undefined &&
    takesSubtask(dragged.id, point.task, parentOf)
  ) {
    return { kind: "lastChild", target: point.task };
  }
  if (point.root !== undefined) {
    return takesSubtask(dragged.id, point.root, parentOf)
      ? { kind: "lastChild", target: point.root }
      : null;
  }
  if (point.other) return dragged.projectRoot ? null : { kind: "projectEnd" };
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
