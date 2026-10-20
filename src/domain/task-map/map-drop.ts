// Where a card dropped on the task map goes (#216): onto a card, or onto a
// parent task's box, by where on it the pointer is let go. Near its leading
// edge the task goes before it, near its trailing edge after it, as a
// sibling; anywhere else it becomes its last subtask. Which edges lead and
// trail follows how the siblings are laid out: left and right in a
// sequential parent task's chain, top and bottom in a plain column. An edge
// is a quarter of the size, never more than `edgeBand`, so a tall box takes
// a drop as its subtask almost everywhere. The move use case refuses what
// cannot be done (onto itself or below it, a page among blocks, a cycle).
// Pure.
import type { TaskMoveNextToTask } from "../blocking/task-move";
import type { TaskId } from "../task/task";

/** The widest a leading or trailing edge gets, in the rectangle's units. */
export const edgeBand = 16;

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

export interface MapRect extends MapPoint {
  readonly width: number;
  readonly height: number;
}

/** The card, or the parent task's box, under the pointer. */
export interface MapDropOver {
  readonly task: TaskId;
  /** Its card's or box's rectangle, in the same units as the pointer. */
  readonly rect: MapRect;
  /** Its parent task is sequential: the siblings run left to right. */
  readonly inSequence: boolean;
}

/** Task `dragged` let go at `pointer` over `over`: the move. */
export function mapDrop(
  dragged: TaskId,
  pointer: MapPoint,
  over: MapDropOver,
): TaskMoveNextToTask {
  const { rect } = over;
  const [offset, size] = over.inSequence
    ? [pointer.x - rect.x, rect.width]
    : [pointer.y - rect.y, rect.height];
  const band = Math.min(size / 4, edgeBand);
  const placement =
    offset < band ? "before" : offset > size - band ? "after" : "lastChild";
  return { id: dragged, target: over.task, placement };
}
