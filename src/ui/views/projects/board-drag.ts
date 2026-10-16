// Dragging on the project board grouped by status: a card or an expanded
// subtask row dropped in another column changes the task to that column's
// status (#168), no block moves, so a subtask stays in its card; dropped on
// another card or row, it becomes that task's last subtask, its status
// unchanged (#169), with the tree's lastChild move and its crossing
// confirmation (`onMove`). What a point takes is domain/project/board-drop.ts:
// on itself, one of its descendant tasks or its parent task a card or a row
// falls back to its column; the task's own column is no drop. The column, or
// the card or row, the pointer is over is highlighted while it would take
// the drop, the done column's narrow strip too.
//
// These are the cards' drops in the plugin panel (`PanelDropTarget`) on the
// shared card drag (ui/drag/card-drag.tsx), which handles the press, the
// threshold, the chip, the fading and a drop on a block in a note panel.
// Near the board's left or right edge it scrolls sideways, near a column's
// top or bottom the column scrolls; scroll snapping is off while dragging.
//
// Smooth by design: the state lives outside React, the highlight is set on
// the DOM directly. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { TaskMove } from "../../../domain/blocking/task-move";
import { type BoardDrop, boardDrop } from "../../../domain/project/board-drop";
import {
  type Task,
  type TaskId,
  type TaskStatus,
  taskStatuses,
} from "../../../domain/task/task";
import type { PanelDropTarget } from "../../drag/card-drag";

/** Marks a column, or the done column's strip, holding its status. */
export const boardColumnAttribute = "data-nextaction-board-drop-status";
/** Marks a card or a subtask row, holding its task's ID. */
export const boardTaskAttribute = "data-nextaction-board-drop-task";
/** Set on the column the pointer is over while it would take the drop. */
const overAttribute = "data-drop-over";
/** Set on the board while dragging: no scroll snapping. */
const draggingAttribute = "data-nextaction-board-dragging";
/** What scrolls up and down in a column. */
const columnBodyClass = "nextaction-board-column-body";

const isStatus = (value: string | null): value is TaskStatus =>
  (taskStatuses as readonly (string | null)[]).includes(value);

/** Where a drop would go, and the element highlighted for it. */
interface DropAt {
  readonly drop: BoardDrop;
  readonly highlight: Element;
}

/** What the drag needs from the board, read when it is used. */
export interface BoardDragSetup {
  readonly root: HTMLElement | null;
  readonly changeStatus: (task: Task, status: TaskStatus) => void;
  /** A task's parent task, as the board shows it (`null`: none, or not on it). */
  readonly parentOf: (id: TaskId) => TaskId | null;
  /** Moves a task, asking first when it crosses the project block's boundary. */
  readonly move: (move: TaskMove, at: { x: number; y: number }) => void;
}

export interface BoardDrag {
  /** The drops in the plugin panel of `task`'s card or row. */
  target(task: Task): PanelDropTarget;
}

/** The drop under the point for `task`, only within `root`. */
function dropAt(
  root: HTMLElement,
  task: Task,
  parentOf: (id: TaskId) => TaskId | null,
  x: number,
  y: number,
): DropAt | null {
  const element = document.elementFromPoint(x, y);
  if (!element || !root.contains(element)) return null;
  const within = (found: Element | null) =>
    found && root.contains(found) ? found : null;
  const onTask = within(element.closest(`[${boardTaskAttribute}]`));
  const column = within(element.closest(`[${boardColumnAttribute}]`));
  const id = Number(onTask?.getAttribute(boardTaskAttribute));
  const status = column?.getAttribute(boardColumnAttribute) ?? null;
  const drop = boardDrop(
    task,
    {
      ...(onTask && Number.isInteger(id) ? { task: id } : {}),
      ...(isStatus(status) ? { column: status } : {}),
    },
    parentOf,
  );
  if (!drop) return null;
  const highlight = drop.kind === "lastChild" ? onTask : column;
  return highlight ? { drop, highlight } : null;
}

export function createBoardDrag(setup: () => BoardDragSetup): BoardDrag {
  let over: DropAt | null = null;

  const highlight = (next: DropAt | null) => {
    if (over?.highlight === next?.highlight) {
      over = next;
      return;
    }
    over?.highlight.removeAttribute(overAttribute);
    next?.highlight.setAttribute(overAttribute, "");
    over = next;
  };

  return {
    target: (task) => ({
      begin() {
        setup().root?.setAttribute(draggingAttribute, "");
      },
      move(x, y) {
        const { root, parentOf } = setup();
        highlight(root ? dropAt(root, task, parentOf, x, y) : null);
      },
      drop(x, y) {
        const { root, changeStatus, parentOf, move } = setup();
        const at = root ? dropAt(root, task, parentOf, x, y) : null;
        if (!at) return false;
        // One drop, one write.
        if (at.drop.kind === "status") changeStatus(task, at.drop.status);
        else {
          move(
            { id: task.id, target: at.drop.target, placement: "lastChild" },
            { x, y },
          );
        }
        return true;
      },
      end() {
        highlight(null);
        setup().root?.removeAttribute(draggingAttribute);
      },
      scrollers() {
        const root = setup().root;
        return root
          ? [...root.querySelectorAll<HTMLElement>(`.${columnBodyClass}`)]
          : [];
      },
      sideScrollers() {
        const root = setup().root;
        return root ? [root] : [];
      },
    }),
  };
}
