// Drawing a dependency on the task map (#219): a connector on a card's right
// edge, shown while the pointer is on the card. Dragged onto another card
// or a box's head card, that task comes to depend on this one, written with
// the set dependencies use case as the task panel does (one undo, stale
// dependencies cleared, a dependency cycle refused).
//
// The gesture is the whiteboard plugin's: pointer events on the connector
// with pointer capture, so neither the card drag (#216) nor the canvas pan
// hears the press. A preview line follows the pointer; the card under it is
// marked droppable or not, on the DOM directly, and a task that cannot
// depend on this one (itself, one depending on it already, one that would
// make a dependency cycle) says why next to the pointer, in the words of the
// task panel's dependency candidates (read-dependent-refusals.ts). Let go on
// empty space or press Esc, nothing is written. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { DependentRefusal } from "../../../application/usecases/read-dependent-refusals";
import type { Task, TaskId } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import type { MemoryStore } from "../../components/memory-store";
import { dependencyCycleText } from "../../task-panel/dependencies-field";
import { useTaskMapEdits } from "./task-map-edits";

/** Marks a card or a box's head card as a task to drop a dependency on. */
const linkAttribute = "data-nextaction-map-link";
/** Set on the card under the pointer while drawing: "ok" or "refused". */
const overAttribute = "data-link-over";
/** Set on the canvas while drawing: the cursor, the edges not hit. */
const linkingAttribute = "data-linking";

/** A dependency being drawn from task `from`, its end at `at` on the world. */
export interface LinkDrag {
  readonly from: TaskId;
  readonly at: { readonly x: number; readonly y: number };
  /** The task under the pointer, and why it cannot depend on `from`. */
  readonly target: TaskId | null;
  readonly refusal: DependentRefusal | null;
}

export interface LinkArea {
  readonly drag: MemoryStore<LinkDrag | null>;
  /** The canvas element, marked while drawing and focused after. */
  readonly viewport: React.RefObject<HTMLElement | null>;
  readonly toWorld: (x: number, y: number) => { x: number; y: number };
  /** The tasks on the map, for their dependencies as read. */
  readonly tasks: ReadonlyMap<TaskId, Task>;
}

const LinkContext = React.createContext<LinkArea | undefined>(undefined);
export const LinkAreaProvider = LinkContext.Provider;

/** The attributes making an element a task to drop a dependency on. */
export function linkTargetAttributes(task: Task): Record<string, string> {
  return { [linkAttribute]: String(task.id) };
}

/** Why a task cannot depend on the task dragged from. */
export function refusalText(refusal: DependentRefusal): string {
  switch (refusal) {
    case "self":
      return t("A task cannot depend on itself");
    case "already":
      return t("Already depends on this task");
    default:
      return dependencyCycleText(refusal);
  }
}

interface Session {
  readonly pointerId: number;
  readonly from: TaskId;
  /** From the use case; `null` until read: then only self and already count. */
  refusals: ReadonlyMap<TaskId, DependentRefusal> | null;
  marked: Element | null;
  readonly start: { x: number; y: number };
  last: { x: number; y: number };
  /** The pointer has gone a few pixels: the task under it is told. */
  moved: boolean;
}

/** How far the pointer goes before the task under it is marked. */
const moveThreshold = 4;

/** The task under (x, y) on the screen to drop on, and its element. */
function targetAt(
  x: number,
  y: number,
): { id: TaskId; element: Element } | null {
  const element = document
    .elementFromPoint(x, y)
    ?.closest(`.nextaction-task-map-world [${linkAttribute}]`);
  if (!element) return null;
  const id = Number(element.getAttribute(linkAttribute));
  return Number.isInteger(id) ? { id, element } : null;
}

/** The connector on `task`'s card; nothing outside the task map. */
export function LinkConnector(props: { task: Task }) {
  const { task } = props;
  const area = React.useContext(LinkContext);
  const edits = useTaskMapEdits();
  const session = React.useRef<Session | null>(null);

  const end = React.useCallback(() => {
    const current = session.current;
    if (!current || !area) return;
    session.current = null;
    current.marked?.removeAttribute(overAttribute);
    area.viewport.current?.removeAttribute(linkingAttribute);
    area.drag.set(null);
  }, [area]);
  // The map going away while drawing.
  React.useEffect(() => end, [end]);

  if (!area || !edits) return null;

  const refusalOf = (current: Session, target: TaskId) => {
    if (target === current.from) return "self";
    if (area.tasks.get(target)?.dependencies.includes(current.from)) {
      return "already";
    }
    return current.refusals?.get(target) ?? null;
  };
  const update = (current: Session) => {
    const { x, y } = current.last;
    current.moved ||=
      Math.hypot(x - current.start.x, y - current.start.y) >= moveThreshold;
    const at = current.moved ? targetAt(x, y) : null;
    const refusal = at ? refusalOf(current, at.id) : null;
    if (current.marked && current.marked !== at?.element) {
      current.marked.removeAttribute(overAttribute);
    }
    current.marked = at?.element ?? null;
    at?.element.setAttribute(overAttribute, refusal ? "refused" : "ok");
    area.drag.set({
      from: current.from,
      at: area.toWorld(x, y),
      target: at?.id ?? null,
      refusal,
    });
  };
  const drop = (current: Session) => {
    if (!current.moved) return;
    const at = targetAt(current.last.x, current.last.y);
    if (!at) return;
    const refusal = refusalOf(current, at.id);
    const dependent = area.tasks.get(at.id);
    if (refusal === "below" || refusal === "waits") {
      // As the task panel says on picking it; nothing is written.
      edits.warn(t("Not added. ${reason}", { reason: refusalText(refusal) }));
    } else if (refusal === null && dependent) {
      void edits.addDependency(dependent, current.from);
    }
  };
  const ours = (event: React.PointerEvent) =>
    session.current?.pointerId === event.pointerId;

  return (
    <span
      className="nextaction-task-map-connector"
      // Focused while drawing, for Esc; the pointer's only.
      tabIndex={-1}
      aria-hidden="true"
      title={t("Drag to a task to make it depend on this one")}
      onPointerDown={(event) => {
        // Neither the card drag nor the canvas pan starts.
        event.stopPropagation();
        if (event.button !== 0 || event.pointerType === "touch") return;
        event.preventDefault();
        end();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus({ preventScroll: true });
        const current: Session = {
          pointerId: event.pointerId,
          from: task.id,
          refusals: null,
          marked: null,
          start: { x: event.clientX, y: event.clientY },
          last: { x: event.clientX, y: event.clientY },
          moved: false,
        };
        session.current = current;
        area.viewport.current?.setAttribute(linkingAttribute, "");
        update(current);
        void edits.readDependentRefusals(task.id).then((refusals) => {
          if (session.current !== current) return;
          current.refusals = refusals;
          update(current);
        });
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        const current = session.current;
        if (!current || !ours(event)) return;
        current.last = { x: event.clientX, y: event.clientY };
        update(current);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        const current = session.current;
        if (!current || !ours(event)) return;
        current.last = { x: event.clientX, y: event.clientY };
        end();
        drop(current);
        area.viewport.current?.focus({ preventScroll: true });
      }}
      onPointerCancel={(event) => {
        if (ours(event)) end();
      }}
      onLostPointerCapture={(event) => {
        if (ours(event)) end();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !session.current) return;
        event.preventDefault();
        event.stopPropagation();
        end();
        area.viewport.current?.focus({ preventScroll: true });
      }}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

/**
 * The preview line from the dragged task's right side to the pointer, and
 * why the task under it cannot depend on that one. On the world, above the
 * arrows; `anchor` is where an arrow leaves a task.
 */
export function LinkPreview(props: {
  drag: MemoryStore<LinkDrag | null>;
  anchor: (id: TaskId) => { x: number; y: number } | null;
  width: number;
  height: number;
}) {
  const drag = React.useSyncExternalStore(
    props.drag.subscribe,
    props.drag.current,
  );
  if (!drag) return null;
  const start = props.anchor(drag.from);
  if (!start) return null;
  const { x: x0, y: y0 } = start;
  const { x: x3, y: y3 } = drag.at;
  const ctrl = Math.min(150, Math.max(20, Math.hypot(x3 - x0, y3 - y0) * 0.42));
  return (
    <>
      <svg
        className="nextaction-task-map-link-preview"
        width={props.width}
        height={props.height}
        aria-hidden="true"
      >
        <path
          d={`M ${x0} ${y0} C ${x0 + ctrl} ${y0}, ${x3 - ctrl} ${y3}, ${x3} ${y3}`}
          data-refused={drag.refusal !== null || undefined}
        />
      </svg>
      {drag.refusal && (
        <div
          className="nextaction-task-map-link-reason"
          role="status"
          style={{ left: x3 + 14, top: y3 + 14 }}
        >
          {refusalText(drag.refusal)}
        </div>
      )}
    </>
  );
}
