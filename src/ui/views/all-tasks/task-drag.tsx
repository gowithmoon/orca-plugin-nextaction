// Dragging a task in the all tasks view: onto another task's card, it becomes
// that task's last subtask (#70); into the gap above a card, it goes before
// that card's task, and into the gap below the last top-level task, after it
// (#71). A gap shows a line while the pointer is over it.
//
// These are the cards' drops in the plugin panel (`PanelDropTarget`) on the
// shared card drag (ui/drag/card-drag.tsx, #124): a press anywhere on a tree
// card but its buttons becomes a drag once the pointer has gone a few pixels;
// the card drag shows the chip and fades the card. Letting go anywhere but
// on a card or a gap in the area cancels it. The list scrolls while the
// pointer is near its top or bottom edge. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  MovePlacement,
  TaskMove,
} from "../../../domain/blocking/task-move";
import type { Task, TaskId } from "../../../domain/task/task";
import { scrollingAncestor } from "../../drag/auto-scroll";
import {
  CardDragArea,
  type PanelDropTarget,
  useCardDrag,
} from "../../drag/card-drag";

/** Marks a card's wrapper as a place to drop, holding the task's ID. */
const dropAttribute = "data-nextaction-drop-task";
/** Marks a gap as a place to drop, holding the task it goes next to. */
const gapAttribute = "data-nextaction-drop-gap";
/** A gap's placement next to its task: "before" or "after". */
const gapPlacementAttribute = "data-placement";

/** Where a drop would go: next to `target`, as `placement` says. */
interface DropAt {
  readonly target: TaskId;
  readonly placement: MovePlacement;
}

/** Tells drop places apart: a card, or a gap before or after a task. */
function dropKey(drop: DropAt): string {
  return `${drop.placement}:${drop.target}`;
}

/** The same place, or none for both. */
function samePlace(a: DropAt | null, b: DropAt | null): boolean {
  return a === b || (a !== null && b !== null && dropKey(a) === dropKey(b));
}

interface DragState {
  readonly task: Task;
  /** The card or gap the pointer is over, if any. */
  readonly over: DropAt | null;
}

interface DragArea {
  /** The `dropKey` of the card or gap the pointer is over, while dragging. */
  readonly over: string | null;
  /** The drops in the area of `task`'s card. */
  target(task: Task): PanelDropTarget;
}

const DragContext = React.createContext<DragArea | undefined>(undefined);

/**
 * The area cards can be dragged and dropped in. A drop on a card or a gap
 * calls `onMove` with its task as the target; the use case refuses what
 * cannot be done.
 */
export function TaskDragArea(props: {
  onMove: (move: TaskMove) => void;
  children: React.ReactNode;
}) {
  const area = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<DragState | null>(null);
  // Read by the drag's handlers, which outlive a render.
  const current = React.useRef<DragState | null>(null);
  const onMove = React.useRef(props.onMove);
  onMove.current = props.onMove;

  const update = React.useCallback((next: DragState | null) => {
    current.current = next;
    setState(next);
  }, []);

  /** The card or gap under the point, only within this area. */
  const targetAt = React.useCallback((x: number, y: number): DropAt | null => {
    const element = document.elementFromPoint(x, y);
    const root = area.current;
    if (!element || !root?.contains(element)) return null;
    const place = element.closest(`[${dropAttribute}], [${gapAttribute}]`);
    if (!place || !root.contains(place)) return null;
    if (place.hasAttribute(gapAttribute)) {
      const target = Number(place.getAttribute(gapAttribute));
      const placement = place.getAttribute(gapPlacementAttribute);
      if (!Number.isInteger(target)) return null;
      if (placement !== "before" && placement !== "after") return null;
      return { target, placement };
    }
    const target = Number(place.getAttribute(dropAttribute));
    return Number.isInteger(target) ? { target, placement: "lastChild" } : null;
  }, []);

  const target = React.useCallback(
    (task: Task): PanelDropTarget => ({
      begin: () => update({ task, over: null }),
      move(x, y) {
        const drag = current.current;
        const over = targetAt(x, y);
        if (drag && !samePlace(drag.over, over)) update({ ...drag, over });
      },
      drop(x, y) {
        if (!current.current) return false;
        const at = targetAt(x, y);
        if (at === null) return false;
        onMove.current({ id: task.id, ...at });
        return true;
      },
      end: () => update(null),
      scrollers() {
        const root = area.current;
        const scroller = root ? scrollingAncestor(root) : undefined;
        return scroller ? [scroller] : [];
      },
    }),
    [targetAt, update],
  );

  const value = React.useMemo<DragArea>(
    () => ({ over: state?.over ? dropKey(state.over) : null, target }),
    [state, target],
  );

  return (
    <CardDragArea>
      <DragContext.Provider value={value}>
        <div
          ref={area}
          className="nextaction-drag-area"
          // Gaps take the pointer only while dragging.
          data-dragging={state !== null || undefined}
        >
          {props.children}
        </div>
      </DragContext.Provider>
    </CardDragArea>
  );
}

/**
 * A card's wrapper: dragged by a press anywhere on the card, where a drag
 * can be dropped, highlighted while over it.
 */
export function TaskDropTarget(props: {
  task: Task;
  children: React.ReactNode;
}) {
  const drag = React.useContext(DragContext);
  const { task } = props;
  // `target` stays the same through a drag; `over` changing does not renew it.
  const targetOf = drag?.target;
  const inPanel = React.useMemo(() => targetOf?.(task), [targetOf, task]);
  const source = useCardDrag(task, inPanel ? { inPanel } : {});
  return (
    <div
      {...source}
      {...{ [dropAttribute]: task.id }}
      data-drop-over={
        drag?.over === dropKey({ target: task.id, placement: "lastChild" }) ||
        undefined
      }
    >
      {props.children}
    </div>
  );
}

/**
 * A gap to drop in, placed by the stylesheet over the space above its list
 * item ("before" `target`) or below it ("after"). Its list item is
 * positioned. Takes the pointer only while dragging; shows a line while the
 * pointer is over it.
 */
export function TaskDropGap(props: {
  target: TaskId;
  placement: Exclude<MovePlacement, "lastChild">;
}) {
  const drag = React.useContext(DragContext);
  if (!drag) return null;
  return (
    <div
      className="nextaction-drop-gap"
      aria-hidden="true"
      {...{
        [gapAttribute]: props.target,
        [gapPlacementAttribute]: props.placement,
      }}
      data-drop-over={
        drag.over ===
          dropKey({ target: props.target, placement: props.placement }) ||
        undefined
      }
    />
  );
}
