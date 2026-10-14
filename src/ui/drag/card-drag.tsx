// Dragging a task card out of the plugin panel (#122 "拖出插件面板"), shared
// by every view: a press anywhere on the card but its buttons becomes a drag
// once the pointer has gone a few pixels, so a click, the buttons and the
// right-click menu stay as they are. Pointer events with pointer capture, not
// the browser's drag and drop (move-blocks 64c, drag-to-note 落点). While
// dragging the card fades and a chip with the task's text follows the
// pointer; over a block in a note panel a line shows where the new block
// would go. Letting go there hands the drop to `onNoteDrop`; letting go
// within the plugin panel hands it to the card's `inPanel` drop, if it has
// one (the all tasks view's move and My Day's scheduling, #124); anywhere
// else cancels. An area without `onNoteDrop` drops nothing in the notes (the
// all tasks view and My Day until #127). While dragging, the `inPanel`
// drop's scrollers scroll near their top and bottom edges (auto-scroll.ts),
// and the card going away (e.g. the task removed in the notes) cancels it.
//
// Smooth by design, as My Day's drag: the state lives outside React; a move
// sets the chip's and the line's positions on the DOM and renders nothing.
// The chip and the line are fixed in `document.body`: inside the view (a
// size container) they would be held within it, and they must reach over
// the note panels. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import { createPortal } from "react-dom";
import type { NoteTarget } from "../../application/ports/task-repository";
import {
  type NoteDropMode,
  type NoteDropPlan,
  resolveNoteDrop,
} from "../../domain/blocking/note-drop";
import type { Task } from "../../domain/task/task";
import { shownText } from "../components/format";
import { scrollNearEdge } from "./auto-scroll";
import { type NoteDropProbe, probeNoteDrop } from "./note-panel-dom";

/** How far the pointer goes before a press is a drag. */
const dragThreshold = 4;
/** Set on the card being dragged, which stays in place, faded. */
const sourceAttribute = "data-nextaction-card-drag-source";
/** Marks a card that can be dragged: its text is not selectable. */
export const cardDragAttribute = "data-nextaction-card-drag";
/** Presses on these are their own, never a drag. */
const ownPress = "button, a, input, textarea, select, [contenteditable]";

/** A task card dropped on a block in a note panel. */
export interface NoteCardDrop {
  readonly task: Task;
  readonly plan: NoteDropPlan;
  readonly target: NoteTarget;
}

/**
 * A view's own drop places inside the plugin panel (#124). Told of every
 * move while the pointer is not over a note panel, and of the drop there;
 * `drop` says whether it took it. `end` follows every drag, dropped or not,
 * after the drop.
 */
export interface PanelDropTarget {
  /** The drag began with the pointer at (x, y), before its first move. */
  begin?(x: number, y: number): void;
  move(x: number, y: number): void;
  drop(x: number, y: number): boolean;
  end(): void;
  /** Whether the chip shows now (My Day's timeline shows a preview instead); shown if absent. */
  showsChip?(): boolean;
  /** What scrolls while the pointer is near its top or bottom edge, the first that can first. */
  scrollers?(): readonly HTMLElement[];
  /**
   * The element holds the pointer from the press on, not only once it is a
   * drag: for a thin strip the pointer leaves before it has gone far enough
   * (My Day's card edges). A click then lands on the element itself.
   */
  readonly captureOnPress?: boolean;
  /** The cursor while dragging: grabbing (the default), or a vertical resize. */
  readonly cursor?: "grab" | "resize";
}

/**
 * A card's drops in the plugin panel: the same for every press, or picked by
 * what the press was on (`null`: none, the card is still dragged).
 */
export type PanelDrop =
  | PanelDropTarget
  | ((pressed: Element) => PanelDropTarget | null);

/** Where a new block would go, as the line shows it. */
interface LineBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

interface Dragging {
  readonly task: Task;
  readonly source: HTMLElement;
  readonly inPanel: PanelDropTarget | undefined;
  /** The block under the pointer and what a drop there writes, if any. */
  over: { probe: NoteDropProbe; plan: NoteDropPlan } | null;
}

/** The drag of one area of cards. */
interface CardDrag {
  subscribe(listener: () => void): () => void;
  /** The task being dragged, if any. */
  task(): Task | null;
  begin(
    task: Task,
    source: HTMLElement,
    inPanel: PanelDropTarget | undefined,
    x: number,
    y: number,
  ): void;
  move(x: number, y: number): void;
  drop(x: number, y: number): void;
  cancel(): void;
  /** One frame while dragging: cancels if the card went away, else scrolls near an edge. */
  frame(): void;
  /** Whether a click ends a drag (and so is no click); asks once. */
  takeClick(): boolean;
  /** A new press: a click left over from a drag is gone. */
  pressed(): void;
  /** The chip and the line, placed on every move. */
  attach(chip: HTMLElement | null, line: HTMLElement | null): void;
}

/** What a drop on the block would write; only references so far (#126 adds Alt). */
function planFor(probe: NoteDropProbe, mode: NoteDropMode): NoteDropPlan {
  return resolveNoteDrop({
    mode,
    zone: probe.zone,
    inlineCaret: probe.inlineCaret,
    root: probe.root,
    expanded: probe.expanded,
  });
}

/** The line for a new block next to the probed block's row, or none. */
function lineBox(probe: NoteDropProbe, plan: NoteDropPlan): LineBox | null {
  if (plan.kind !== "newBlock") return null;
  const { row } = probe;
  // A first child comes right below the row (#125 checks it in Orca).
  const top = plan.placement === "before" ? row.top : row.bottom;
  return { left: row.left, top, width: row.width };
}

function createCardDrag(
  onNoteDrop: () => ((drop: NoteCardDrop) => void) | undefined,
) {
  let dragging: Dragging | null = null;
  let point = { x: 0, y: 0 };
  let clickTaken = false;
  let chip: HTMLElement | null = null;
  let line: HTMLElement | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };

  const place = () => {
    if (chip) {
      chip.hidden = dragging?.inPanel?.showsChip?.() === false;
      chip.style.setProperty(
        "transform",
        `translate(${point.x + 12}px, ${point.y + 8}px)`,
      );
    }
    if (!line) return;
    const over = dragging?.over;
    const box = over ? lineBox(over.probe, over.plan) : null;
    if (!box) {
      line.hidden = true;
      return;
    }
    line.hidden = false;
    line.style.setProperty(
      "transform",
      `translate(${box.left}px, ${box.top - 1}px)`,
    );
    line.style.setProperty("width", `${box.width}px`);
  };

  /** What lies under the pointer now. */
  const update = () => {
    const drag = dragging;
    if (!drag) return;
    // Nothing drops in the notes: no probing, the drag stays the view's own.
    const probe = onNoteDrop() ? probeNoteDrop(point.x, point.y) : null;
    drag.over = probe ? { probe, plan: planFor(probe, "ref") } : null;
    if (!probe) drag.inPanel?.move(point.x, point.y);
    place();
  };

  /** Ends the drag, leaving the DOM as it was. */
  const end = (): Dragging | null => {
    const drag = dragging;
    if (!drag) return null;
    dragging = null;
    clickTaken = true;
    drag.source.removeAttribute(sourceAttribute);
    document.documentElement.removeAttribute(sourceAttribute);
    drag.inPanel?.end();
    return drag;
  };

  const drag: CardDrag = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    task: () => dragging?.task ?? null,
    begin(task, source, inPanel, x, y) {
      if (dragging) return;
      point = { x, y };
      dragging = { task, source, inPanel, over: null };
      source.setAttribute(sourceAttribute, "");
      // The cursor everywhere (card-drag-style.ts), and no text selected in the notes.
      document.documentElement.setAttribute(
        sourceAttribute,
        inPanel?.cursor === "resize" ? "resize" : "",
      );
      inPanel?.begin?.(x, y);
      emit();
    },
    move(x, y) {
      if (!dragging) return;
      point = { x, y };
      // Text selected before is not what is dragged.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();
      update();
    },
    drop(x, y) {
      if (!dragging) return;
      point = { x, y };
      update();
      const { task, over, inPanel } = dragging;
      // Handed over before the drag ends, so what the drop wrote and the
      // drag's end show in one frame.
      try {
        const noteDrop = onNoteDrop();
        if (over && noteDrop) {
          noteDrop({ task, plan: over.plan, target: over.probe.target });
        } else {
          inPanel?.drop(x, y);
        }
      } finally {
        if (end()) emit();
      }
    },
    cancel() {
      if (end()) emit();
    },
    frame() {
      const current = dragging;
      if (!current) return;
      // Its pointer events went with it: nothing else would end the drag.
      if (!current.source.isConnected) {
        drag.cancel();
        return;
      }
      const scrollers = current.inPanel?.scrollers?.() ?? [];
      // What lies under a still pointer moved.
      if (scrollNearEdge(scrollers, point.x, point.y)) update();
    },
    takeClick() {
      const taken = clickTaken;
      clickTaken = false;
      return taken;
    },
    pressed() {
      clickTaken = false;
    },
    attach(nextChip, nextLine) {
      chip = nextChip;
      line = nextLine;
      place();
    },
  };
  return drag;
}

const CardDragContext = React.createContext<CardDrag | undefined>(undefined);

const noTask = () => null;
const noSubscribe = () => () => {};

/** The chip under the pointer and the insertion line, while dragging. */
function CardDragOverlay(props: { drag: CardDrag }) {
  const { drag } = props;
  const task = React.useSyncExternalStore(drag.subscribe, drag.task ?? noTask);
  const chip = React.useRef<HTMLDivElement>(null);
  const line = React.useRef<HTMLDivElement>(null);
  // After every render (a drag beginning or ending): the chip and the line
  // exist only while dragging.
  React.useLayoutEffect(() => {
    drag.attach(chip.current, line.current);
    return () => drag.attach(null, null);
  });
  // One frame at a time while dragging; stops with the drag, and when the
  // area goes (ARCHITECTURE §4's exception for component timers).
  React.useEffect(() => {
    if (!task) return;
    let frame = 0;
    const step = () => {
      drag.frame();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [drag, task]);
  if (!task) return null;
  return createPortal(
    <>
      <div
        ref={line}
        className="nextaction-note-drop-line"
        aria-hidden="true"
        hidden
      />
      <div ref={chip} className="nextaction-card-drag-chip" aria-hidden="true">
        {shownText(task).text}
      </div>
    </>,
    document.body,
  );
}

/**
 * An area whose task cards can be dragged out of the plugin panel; a drop
 * on a block in a note panel calls `onNoteDrop`. Without it nothing drops
 * in the notes, only on the cards' `inPanel` drops.
 */
export function CardDragArea(props: {
  onNoteDrop?: (drop: NoteCardDrop) => void;
  children: React.ReactNode;
}) {
  const onNoteDrop = React.useRef(props.onNoteDrop);
  onNoteDrop.current = props.onNoteDrop;
  const [drag] = React.useState(() => createCardDrag(() => onNoteDrop.current));
  // The view going away (the panel closing, the plugin unloading) ends it.
  React.useEffect(() => () => drag.cancel(), [drag]);
  return (
    <CardDragContext.Provider value={drag}>
      {props.children}
      <CardDragOverlay drag={drag} />
    </CardDragContext.Provider>
  );
}

/**
 * The pointer handlers, and the marker, that make an element holding a task
 * card a drag source; spread them on it. Nothing outside a `CardDragArea`.
 * `inPanel`: the view's own drop places in the plugin panel, if any; as a
 * function, picked by what a press is on.
 */
export function useCardDrag(
  task: Task,
  options: { inPanel?: PanelDrop } = {},
): React.HTMLAttributes<HTMLElement> {
  const drag = React.useContext(CardDragContext);
  /** Where the press began and its drop places, while pressed. */
  const press = React.useRef<{
    readonly x: number;
    readonly y: number;
    readonly inPanel: PanelDropTarget | undefined;
  } | null>(null);
  const dragging = React.useRef(false);
  // Subscribed so the handlers stay current; nothing renders per move.
  React.useSyncExternalStore(
    drag?.subscribe ?? noSubscribe,
    drag?.task ?? noTask,
  );
  if (!drag) return {};

  const reset = () => {
    press.current = null;
    dragging.current = false;
  };

  return {
    [cardDragAttribute]: "",
    onPointerDown(event) {
      drag.pressed();
      reset();
      const { target } = event;
      if (event.button !== 0 || !(target instanceof Element)) return;
      if (target.closest(ownPress)) return;
      const { inPanel } = options;
      const picked =
        (typeof inPanel === "function" ? inPanel(target) : inPanel) ??
        undefined;
      // Not prevented: clicks, focus and the right-click menu stay as they are.
      press.current = { x: event.clientX, y: event.clientY, inPanel: picked };
      if (picked?.captureOnPress) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    },
    onPointerMove(event) {
      const start = press.current;
      if (!start) return;
      if (!dragging.current) {
        // Let go somewhere this element did not hear.
        if ((event.buttons & 1) === 0) {
          reset();
          return;
        }
        const { clientX: x, clientY: y } = event;
        if (Math.hypot(x - start.x, y - start.y) < dragThreshold) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.begin(task, event.currentTarget, start.inPanel, x, y);
      }
      drag.move(event.clientX, event.clientY);
    },
    onPointerUp(event) {
      const wasDragging = dragging.current;
      reset();
      if (wasDragging) drag.drop(event.clientX, event.clientY);
    },
    onPointerCancel() {
      reset();
      drag.cancel();
    },
    // Released by anything else (e.g. the window losing focus): cancelled.
    // After a drop it finds nothing to cancel.
    onLostPointerCapture() {
      const wasDragging = dragging.current;
      reset();
      if (wasDragging) drag.cancel();
    },
    // The browser's own drag of selected text would take the pointer.
    onDragStart(event) {
      if (press.current) event.preventDefault();
    },
    // The click that ends a drag opens nothing.
    onClickCapture(event) {
      // From the keyboard (no pointer, `detail` 0): never a drag's.
      if (event.detail === 0) return;
      if (!drag.takeClick()) return;
      event.preventDefault();
      event.stopPropagation();
    },
  } as React.HTMLAttributes<HTMLElement>;
}
