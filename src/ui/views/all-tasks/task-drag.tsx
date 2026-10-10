// Dragging a task in the all tasks view: onto another task's card, it becomes
// that task's last subtask (#70); into the gap above a card, it goes before
// that card's task, and into the gap below the last top-level task, after it
// (#71). A gap shows a line while the pointer is over it. Pointer events with
// pointer capture, not
// the browser's drag and drop, so Orca's note panels never take a drag from
// here and a drag from the notes is never taken here (move-blocks 64c).
// A drag starts from the handle on a card once the pointer has gone a few
// pixels, so a click and selecting text stay as they are. Letting go
// anywhere but on a card or a gap in the area cancels it. The list scrolls while the
// pointer is near its top or bottom edge. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  MovePlacement,
  TaskMove,
} from "../../../domain/blocking/task-move";
import type { Task, TaskId } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { shownText } from "../../components/format";

/** How far the pointer goes before a press on the handle is a drag. */
const dragThreshold = 4;
/** How close to the scrolling list's top or bottom edge it scrolls. */
const scrollEdge = 40;
/** The most it scrolls per frame, right at the edge. */
const scrollStep = 14;
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
  readonly dragging: TaskId | null;
  /** The `dropKey` of the card or gap the pointer is over, if any. */
  readonly over: string | null;
  /** The pointer moved with the handle of `task` pressed. */
  move(task: Task, x: number, y: number): void;
  /** The pointer was let go. */
  drop(x: number, y: number): void;
  cancel(): void;
}

const DragContext = React.createContext<DragArea | undefined>(undefined);

/** The nearest ancestor that scrolls vertically, if any. */
function scrollingAncestor(element: HTMLElement): HTMLElement | undefined {
  for (
    let current = element.parentElement;
    current;
    current = current.parentElement
  ) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") return current;
  }
  return undefined;
}

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
  const preview = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<DragState | null>(null);
  // Read by the pointer handlers and the scrolling frame, which outlive a render.
  const current = React.useRef<DragState | null>(null);
  const pointer = React.useRef({ x: 0, y: 0 });
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

  const placePreview = React.useCallback(() => {
    const { x, y } = pointer.current;
    preview.current?.style.setProperty(
      "transform",
      `translate(${x + 12}px, ${y + 8}px)`,
    );
  }, []);

  const value = React.useMemo<DragArea>(
    () => ({
      dragging: state?.task.id ?? null,
      over: state?.over ? dropKey(state.over) : null,
      move(task, x, y) {
        pointer.current = { x, y };
        const over = targetAt(x, y);
        const drag = current.current;
        if (!drag || drag.task.id !== task.id || !samePlace(drag.over, over)) {
          update({ task, over });
        }
        placePreview();
      },
      drop(x, y) {
        const drag = current.current;
        if (!drag) return;
        update(null);
        const at = targetAt(x, y);
        if (at === null) return;
        onMove.current({ id: drag.task.id, ...at });
      },
      cancel() {
        if (current.current) update(null);
      },
    }),
    [state, targetAt, update, placePreview],
  );

  const dragging = state !== null;
  // Placed once it shows: the first move rendered it.
  React.useLayoutEffect(() => {
    if (dragging) placePreview();
  }, [dragging, placePreview]);

  // Scrolls while the pointer stays near an edge of the list, one step a
  // frame; stops with the drag, and when the view goes (the panel closing or
  // the plugin unloading unmounts it).
  React.useEffect(() => {
    const root = area.current;
    const scroller = dragging && root ? scrollingAncestor(root) : undefined;
    if (!scroller) return;
    let frame = 0;
    const step = () => {
      const { x, y } = pointer.current;
      const box = scroller.getBoundingClientRect();
      let by = 0;
      if (x >= box.left && x <= box.right) {
        if (y >= box.top && y < box.top + scrollEdge) {
          by = -Math.ceil(
            ((box.top + scrollEdge - y) / scrollEdge) * scrollStep,
          );
        } else if (y <= box.bottom && y > box.bottom - scrollEdge) {
          by = Math.ceil(
            ((y - (box.bottom - scrollEdge)) / scrollEdge) * scrollStep,
          );
        }
      }
      if (by !== 0) {
        scroller.scrollTop += by;
        // The cards moved under the pointer.
        const drag = current.current;
        const over = targetAt(x, y);
        if (drag && !samePlace(drag.over, over)) update({ ...drag, over });
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [dragging, targetAt, update]);

  return (
    <DragContext.Provider value={value}>
      <div
        ref={area}
        className="nextaction-drag-area"
        // Gaps take the pointer only while dragging.
        data-dragging={dragging || undefined}
      >
        {props.children}
      </div>
      {state && (
        <div
          ref={preview}
          className="nextaction-drag-preview"
          aria-hidden="true"
        >
          {shownText(state.task).text}
        </div>
      )}
    </DragContext.Provider>
  );
}

/** A card's wrapper: where a drag can be dropped, highlighted while over it. */
export function TaskDropTarget(props: {
  id: TaskId;
  children: React.ReactNode;
}) {
  const drag = React.useContext(DragContext);
  return (
    <div
      {...{ [dropAttribute]: props.id }}
      data-drop-over={
        (drag?.over === dropKey({ target: props.id, placement: "lastChild" }) &&
          drag.dragging !== null) ||
        undefined
      }
      data-dragging={drag?.dragging === props.id || undefined}
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
  placement: "before" | "after";
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
        (drag.dragging !== null &&
          drag.over ===
            dropKey({ target: props.target, placement: props.placement })) ||
        undefined
      }
    />
  );
}

/**
 * The handle a drag starts from. Pointer only: dragging from the keyboard is
 * not offered (#63), so it is hidden from assistive technology and takes no
 * focus.
 */
export function TaskDragHandle(props: { task: Task }) {
  const drag = React.useContext(DragContext);
  /** Where the press began, while the handle is pressed. */
  const pressed = React.useRef<{ x: number; y: number } | null>(null);
  const dragging = React.useRef(false);
  if (!drag) return null;

  const end = () => {
    pressed.current = null;
    dragging.current = false;
  };

  return (
    <span
      className="nextaction-drag-handle"
      aria-hidden="true"
      title={t(
        "Drag onto another task to make it a subtask, or between tasks to move it there",
      )}
      data-dragging={drag.dragging === props.task.id || undefined}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        // No text selection, and no click on the card from this press.
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        pressed.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        const start = pressed.current;
        if (!start) return;
        if (
          !dragging.current &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) <
            dragThreshold
        ) {
          return;
        }
        dragging.current = true;
        drag.move(props.task, event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        const wasDragging = dragging.current;
        end();
        if (wasDragging) drag.drop(event.clientX, event.clientY);
      }}
      onPointerCancel={() => {
        end();
        drag.cancel();
      }}
      // Released by anything else (e.g. the window losing focus): cancelled.
      // After a drop it finds nothing to cancel.
      onLostPointerCapture={() => {
        end();
        drag.cancel();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <i className="ti ti-grip-vertical" />
    </span>
  );
}
