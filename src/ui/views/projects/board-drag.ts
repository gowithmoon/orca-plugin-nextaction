// Dragging on the project board grouped by status (#168): a card or an
// expanded subtask row dropped in another column changes the task to that
// column's status (domain/project/board-drop.ts); no block moves, so a
// subtask stays in its card. The column the pointer is over is highlighted,
// the done column's narrow strip too; the task's own column is no drop: no
// highlight, nothing written. A drop on a card or a row counts, for now, as
// one in the column it is in; becoming its last subtask comes with #169,
// which `dropAt` leaves the place for (the task marker).
//
// These are the cards' drops in the plugin panel (`PanelDropTarget`) on the
// shared card drag (ui/drag/card-drag.tsx), which handles the press, the
// threshold, the chip, the fading and a drop on a block in a note panel.
// Near the board's left or right edge it scrolls sideways, near a column's
// top or bottom the column scrolls; scroll snapping is off while dragging.
//
// Smooth by design: the state lives outside React, the highlight is set on
// the DOM directly. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import {
  type BoardDrop,
  boardStatusDrop,
} from "../../../domain/project/board-drop";
import {
  type Task,
  type TaskStatus,
  taskStatuses,
} from "../../../domain/task/task";
import type { PanelDropTarget } from "../../drag/card-drag";

/** Marks a column, or the done column's strip, holding its status. */
export const boardColumnAttribute = "data-nextaction-board-drop-status";
/** Marks a card or a subtask row, holding its task's ID (for #169). */
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
}

export interface BoardDrag {
  /** The drops in the plugin panel of `task`'s card or row. */
  target(task: Task): PanelDropTarget;
}

/** The drop under the point for `task`, only within `root`. */
function dropAt(
  root: HTMLElement,
  task: Task,
  x: number,
  y: number,
): DropAt | null {
  const element = document.elementFromPoint(x, y);
  if (!element || !root.contains(element)) return null;
  // A card or a row (`boardTaskAttribute`) takes its column's drop until
  // #169 makes it a place of its own.
  const column = element.closest(`[${boardColumnAttribute}]`);
  if (!column || !root.contains(column)) return null;
  const status = column.getAttribute(boardColumnAttribute);
  if (!isStatus(status)) return null;
  const drop = boardStatusDrop(task.status, status);
  return drop ? { drop, highlight: column } : null;
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
        const { root } = setup();
        highlight(root ? dropAt(root, task, x, y) : null);
      },
      drop(x, y) {
        const { root, changeStatus } = setup();
        const at = root ? dropAt(root, task, x, y) : null;
        if (!at) return false;
        changeStatus(task, at.drop.status);
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
