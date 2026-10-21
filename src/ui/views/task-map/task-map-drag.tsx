// Dragging a card on the task map moves its task (#216): let go on another
// card, or on a parent task's box, it goes before or after that task as a
// sibling or becomes its last subtask, as domain/task-map/map-drop.ts says
// for where on it the pointer is. The move use case refuses what cannot be
// done and `onMove` tells the user, as in the all tasks view; a move across
// project boxes asks nothing. Let go on a project box's or the no-project
// area's empty space, `onAreaDrop` makes it belong to that project, or to
// none (area-drop.tsx, #222).
//
// These are the cards' drops in the plugin panel (`PanelDropTarget`) on the
// shared card drag (ui/drag/card-drag.tsx): a press on a card but its
// buttons becomes a drag once the pointer has gone a few pixels, so a click
// and the right-click menu stay as they are. A box is dragged by its head
// card. Nothing drops in the notes, and the canvas does not pan while
// dragging. The place a drop would go is marked on the card or box under
// the pointer, on the DOM directly: a line before or after it, or an outline
// for a subtask. The rectangles are the screen's, so the zoom changes
// nothing. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { MoveToAreaTarget } from "../../../application/usecases/move-to-area";
import type { TaskMove } from "../../../domain/blocking/task-move";
import type { Task } from "../../../domain/task/task";
import { mapDrop } from "../../../domain/task-map/map-drop";
import {
  CardDragArea,
  type PanelDropTarget,
  useCardDrag,
} from "../../drag/card-drag";

/** Marks a card's or a box's element as a place to drop, holding its task's ID. */
const dropAttribute = "data-nextaction-map-drop";
/** Set on a place to drop whose parent task is sequential. */
const inSequenceAttribute = "data-in-sequence";
/** Set on the place the pointer is over: "before", "after" or "lastChild"; "area" on an area. */
const overAttribute = "data-drop-over";
/** Marks an area as a place to drop: its project's ID, empty for no project. */
const areaAttribute = "data-nextaction-map-area";

/** Where a drop at (x, y) puts `task`, and the element it marks. */
type DropPlace =
  | { move: TaskMove; element: Element }
  | { area: MoveToAreaTarget; element: Element };

/** The drop at (x, y) for `task`: on a card or box, else on an area's empty space. */
function dropAt(task: Task, x: number, y: number): DropPlace | null {
  const under = document.elementFromPoint(x, y);
  const element = under?.closest(
    `.nextaction-task-map-world [${dropAttribute}]`,
  );
  if (!element) {
    const area = under?.closest(
      `.nextaction-task-map-world [${areaAttribute}]`,
    );
    if (!area) return null;
    const value = area.getAttribute(areaAttribute);
    const project = Number(value);
    if (value === "") return { area: { kind: "noProject" }, element: area };
    if (!Number.isInteger(project)) return null;
    return { area: { kind: "project", project }, element: area };
  }
  const target = Number(element.getAttribute(dropAttribute));
  if (!Number.isInteger(target)) return null;
  const move = mapDrop(
    task.id,
    { x, y },
    {
      task: target,
      rect: element.getBoundingClientRect(),
      inSequence: element.hasAttribute(inSequenceAttribute),
    },
  );
  return { move, element };
}

const DragContext = React.createContext<
  ((task: Task) => PanelDropTarget) | undefined
>(undefined);

/**
 * The map's cards can be dragged in it; a drop on a card or box calls
 * `onMove`, one on an area's empty space `onAreaDrop`.
 */
export function TaskMapDragArea(props: {
  onMove: (move: TaskMove) => void;
  onAreaDrop: (task: Task, target: MoveToAreaTarget) => void;
  children: React.ReactNode;
}) {
  const onMove = React.useRef(props.onMove);
  onMove.current = props.onMove;
  const onAreaDrop = React.useRef(props.onAreaDrop);
  onAreaDrop.current = props.onAreaDrop;

  const target = React.useCallback((task: Task): PanelDropTarget => {
    let marked: Element | null = null;
    const mark = (next: DropPlace | null) => {
      if (marked && marked !== next?.element) {
        marked.removeAttribute(overAttribute);
      }
      marked = next?.element ?? null;
      if (next && "area" in next) {
        next.element.setAttribute(overAttribute, "area");
      } else if (next && "placement" in next.move) {
        next.element.setAttribute(overAttribute, next.move.placement);
      }
    };
    return {
      move: (x, y) => mark(dropAt(task, x, y)),
      drop(x, y) {
        const at = dropAt(task, x, y);
        if (!at) return false;
        if ("area" in at) onAreaDrop.current(task, at.area);
        else onMove.current(at.move);
        return true;
      },
      end: () => mark(null),
    };
  }, []);

  return (
    <CardDragArea>
      <DragContext.Provider value={target}>
        {props.children}
      </DragContext.Provider>
    </CardDragArea>
  );
}

/**
 * The attributes making an element a place to drop for task `task`;
 * `inSequence`: its parent task is sequential.
 */
export function mapDropAttributes(
  task: Task,
  inSequence: boolean,
): Record<string, string | undefined> {
  return {
    [dropAttribute]: String(task.id),
    [inSequenceAttribute]: inSequence ? "" : undefined,
  };
}

/** The attribute making an area a place to drop (#222). */
export function mapAreaDropAttributes(
  area: MoveToAreaTarget,
): Record<string, string> {
  return {
    [areaAttribute]: area.kind === "project" ? String(area.project) : "",
  };
}

/** The handlers making an element holding `task`'s card drag it. */
export function useMapCardDrag(task: Task): React.HTMLAttributes<HTMLElement> {
  const targetOf = React.useContext(DragContext);
  const inPanel = React.useMemo(() => targetOf?.(task), [targetOf, task]);
  return useCardDrag(task, inPanel ? { inPanel } : {});
}
