// What a drop on the project board writes (ROADMAP step 11 phase 4, #168).
// Grouped by status, a drop in a column changes the task to the column's
// status and moves no block; a drop back in the task's own column is no drop
// at all: it writes nothing and nothing is highlighted. A drop on a card or
// a subtask row (becoming its last subtask, #169) comes later; until then it
// counts as a drop in the card's column. One drop makes one write. Pure.
import type { TaskStatus } from "../task/task";

/** The single write a board drop makes. */
export interface BoardDrop {
  readonly kind: "status";
  readonly status: TaskStatus;
}

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
