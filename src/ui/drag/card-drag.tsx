// Dragging a task card out of the plugin panel (#122 "拖出插件面板"), shared
// by every view: a press anywhere on the card but its buttons becomes a drag
// once the pointer has gone a few pixels, so a click, the buttons and the
// right-click menu stay as they are. Pointer events with pointer capture, not
// the browser's drag and drop (move-blocks 64c, drag-to-note 落点). While
// dragging the card fades and a chip with the task's text follows the
// pointer; over a block in a note panel a line shows where the new block
// would go, or a caret where an inline reference would, and near a note
// panel's top or bottom the panel scrolls (#125), as the plugin panel's
// scrollers do (auto-scroll.ts). Letting go there hands
// the drop to `onNoteDrop`; letting go within the plugin panel hands it to the card's `inPanel` drop, if it has
// one (the all tasks view's move and My Day's scheduling, #124); anywhere
// else cancels. An area without `onNoteDrop`, or an `inPanel` drop that
// keeps to the panel (My Day's card edges, #127), drops nothing in the
// notes. While dragging, the `inPanel`
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
import type { NoteCursorSource } from "../../application/ports/note-cursor";
import type { NoteTarget } from "../../application/ports/task-repository";
import {
  type NoteDropMode,
  type NoteDropPlan,
  resolveNoteDrop,
} from "../../domain/blocking/note-drop";
import type { Task } from "../../domain/task/task";
import { shownText } from "../components/format";
import { scrollAmount, scrollNearEdge } from "./auto-scroll";
import {
  type NoteDropProbe,
  noteScrollerAt,
  probeNoteDrop,
} from "./note-panel-dom";

/** How far the pointer goes before a press is a drag. */
const dragThreshold = 4;
/** Set on the card being dragged, which stays in place, faded. */
const sourceAttribute = "data-nextaction-card-drag-source";
/**
 * Set on the document root while dragging, for the cursor everywhere. Not
 * `sourceAttribute`: the fade matches that one, and would fade the whole
 * window (acceptance of #122).
 */
const draggingAttribute = "data-nextaction-card-dragging";
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
  /** What scrolls sideways while the pointer is near its left or right edge (the project board, #168). */
  sideScrollers?(): readonly HTMLElement[];
  /**
   * The element holds the pointer from the press on, not only once it is a
   * drag: for a thin strip the pointer leaves before it has gone far enough
   * (My Day's card edges). A click then lands on the element itself.
   */
  readonly captureOnPress?: boolean;
  /** The cursor while dragging: grabbing (the default), or a vertical resize. */
  readonly cursor?: "grab" | "resize";
  /**
   * The drag never drops in the notes, even in an area that does (My Day's
   * card edges only change the times, #127).
   */
  readonly keepsToPanel?: boolean;
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
  /** `alt`: Alt (Option on macOS) is held, for a mirror (#126). */
  move(x: number, y: number, alt: boolean): void;
  drop(x: number, y: number, alt: boolean): void;
  cancel(): void;
  /** One frame while dragging: cancels if the card went away, else scrolls near an edge. */
  frame(): void;
  /** Whether a click ends a drag (and so is no click); asks once. */
  takeClick(): boolean;
  /** A new press: a click left over from a drag is gone. */
  pressed(): void;
  /** The chip, the line and the insertion caret, placed on every move. */
  attach(
    chip: HTMLElement | null,
    line: HTMLElement | null,
    caret: HTMLElement | null,
  ): void;
}

/**
 * What a drop with Alt (Option on macOS) held writes: a mirror; without it,
 * a reference (#126). No menu, no hint.
 */
function modeFor(alt: boolean): NoteDropMode {
  return alt ? "mirror" : "ref";
}

/** What a drop on the block would write in `mode`. */
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
  // After and a first child both come right below the row: blocks touch,
  // with no gap (drag-to-note 落点). Checked by hand in Orca (#125).
  const top = plan.placement === "before" ? row.top : row.bottom;
  return { left: row.left, top, width: row.width };
}

/** The insertion caret at the inline caret, or none (#125). */
function caretBox(probe: NoteDropProbe, plan: NoteDropPlan): DOMRect | null {
  return plan.kind === "inline" ? probe.caretBox : null;
}

/** The drags under way told of Alt going down or up (#126). */
const altListeners = new Set<(alt: boolean) => void>();

/**
 * Alt (Option on macOS) going down or up, for a drag under way to switch
 * between a reference and a mirror while the pointer stays still (#126).
 * `platform` listens for `keydown` and `keyup` on the window, capturing,
 * through the registry, and hands every event here; nothing is prevented,
 * so Orca still sees the key. The drop itself reads Alt from the release's
 * pointer event.
 */
export function handleCardDragAltKey(event: KeyboardEvent): void {
  if (event.key !== "Alt") return;
  for (const listener of [...altListeners]) listener(event.altKey);
}

/**
 * Orca's cursor data at a place in a note panel (infra, through the
 * NoteCursorSource port), given by the plugin panel to every card drag in
 * it. Without it no drop lands in the notes.
 */
export const NoteCursorContext = React.createContext<
  NoteCursorSource | undefined
>(undefined);

function createCardDrag(
  onNoteDrop: () => ((drop: NoteCardDrop) => void) | undefined,
  cursors: () => NoteCursorSource | undefined,
) {
  let dragging: Dragging | null = null;
  let point = { x: 0, y: 0 };
  /** Alt (Option on macOS) is held: a drop writes a mirror (#126). */
  let alt = false;
  let clickTaken = false;
  let chip: HTMLElement | null = null;
  let line: HTMLElement | null = null;
  let caret: HTMLElement | null = null;
  /** The frame that scrolls a note panel under the pointer, while near its edge. */
  let scrollFrame: number | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  /** Where the drag drops in the notes, if it does at all. */
  const noteDropOf = (drag: Dragging) =>
    drag.inPanel?.keepsToPanel || !cursors() ? undefined : onNoteDrop();

  const place = () => {
    if (chip) {
      chip.hidden = dragging?.inPanel?.showsChip?.() === false;
      chip.style.setProperty(
        "transform",
        `translate(${point.x + 12}px, ${point.y + 8}px)`,
      );
    }
    const over = dragging?.over;
    if (caret) {
      const at = over ? caretBox(over.probe, over.plan) : null;
      caret.hidden = !at;
      if (at) {
        caret.style.setProperty(
          "transform",
          `translate(${at.left}px, ${at.top}px)`,
        );
        caret.style.setProperty("height", `${at.height}px`);
      }
    }
    if (!line) return;
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

  /**
   * Scrolls the note panel under the pointer while it is near the panel's
   * top or bottom, a frame at a time, probing again as the blocks move.
   */
  const scroll = () => {
    scrollFrame = null;
    // Nothing drops in the notes: they are not scrolled either.
    if (!dragging || !noteDropOf(dragging)) return;
    const scroller = noteScrollerAt(point.x, point.y);
    const step = scroller ? scrollAmount(scroller, point.x, point.y, "y") : 0;
    if (!scroller || step === 0) return;
    const before = scroller.scrollTop;
    scroller.scrollTop = before + step;
    if (scroller.scrollTop === before) return;
    update();
    scrollFrame = requestAnimationFrame(scroll);
  };
  const scrollSoon = () => {
    if (scrollFrame === null) scrollFrame = requestAnimationFrame(scroll);
  };
  const stopScrolling = () => {
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
  };

  /** What lies under the pointer now. */
  const update = () => {
    const drag = dragging;
    if (!drag) return;
    // Nothing drops in the notes: no probing, the drag stays the view's own.
    const source = cursors();
    const probe =
      source && noteDropOf(drag)
        ? probeNoteDrop(source, point.x, point.y)
        : null;
    drag.over = probe ? { probe, plan: planFor(probe, modeFor(alt)) } : null;
    if (!probe) drag.inPanel?.move(point.x, point.y);
    place();
  };

  /**
   * Alt going down or up while the pointer stays still: the line and the
   * insertion caret switch at once (#126). Heard only while dragging: joined
   * in `begin`, left in `end`, which the area's unmount runs too.
   */
  const onAlt = (held: boolean) => {
    if (held === alt) return;
    alt = held;
    update();
  };

  /** Ends the drag, leaving the DOM as it was. */
  const end = (): Dragging | null => {
    const drag = dragging;
    if (!drag) return null;
    dragging = null;
    stopScrolling();
    altListeners.delete(onAlt);
    clickTaken = true;
    drag.source.removeAttribute(sourceAttribute);
    document.documentElement.removeAttribute(draggingAttribute);
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
      altListeners.add(onAlt);
      source.setAttribute(sourceAttribute, "");
      // The cursor everywhere (card-drag-style.ts), and no text selected in the notes.
      document.documentElement.setAttribute(
        draggingAttribute,
        inPanel?.cursor === "resize" ? "resize" : "",
      );
      inPanel?.begin?.(x, y);
      emit();
    },
    move(x, y, altHeld) {
      if (!dragging) return;
      point = { x, y };
      alt = altHeld;
      // Text selected before is not what is dragged.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();
      update();
      scrollSoon();
    },
    drop(x, y, altHeld) {
      if (!dragging) return;
      point = { x, y };
      // As the release's pointer event says, whatever the keys said before.
      alt = altHeld;
      update();
      const { task, over, inPanel } = dragging;
      // Handed over before the drag ends, so what the drop wrote and the
      // drag's end show in one frame.
      try {
        const noteDrop = noteDropOf(dragging);
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
      const { inPanel } = current;
      const scrolled = scrollNearEdge(
        inPanel?.scrollers?.() ?? [],
        point.x,
        point.y,
        "y",
      );
      const sideways = scrollNearEdge(
        inPanel?.sideScrollers?.() ?? [],
        point.x,
        point.y,
        "x",
      );
      // What lies under a still pointer moved.
      if (scrolled || sideways) update();
    },
    takeClick() {
      const taken = clickTaken;
      clickTaken = false;
      return taken;
    },
    pressed() {
      clickTaken = false;
    },
    attach(nextChip, nextLine, nextCaret) {
      chip = nextChip;
      line = nextLine;
      caret = nextCaret;
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
  const caret = React.useRef<HTMLDivElement>(null);
  // After every render (a drag beginning or ending): the chip, the line and
  // the caret exist only while dragging.
  React.useLayoutEffect(() => {
    drag.attach(chip.current, line.current, caret.current);
    return () => drag.attach(null, null, null);
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
      <div
        ref={caret}
        className="nextaction-note-drop-caret"
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
  const noteCursors = React.useContext(NoteCursorContext);
  const cursors = React.useRef(noteCursors);
  cursors.current = noteCursors;
  const [drag] = React.useState(() =>
    createCardDrag(
      () => onNoteDrop.current,
      () => cursors.current,
    ),
  );
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
      // A drag source within this one (a board card's subtask row, #168)
      // drags its own task; this one leaves the press to it.
      if (target.closest(`[${cardDragAttribute}]`) !== event.currentTarget) {
        return;
      }
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
      drag.move(event.clientX, event.clientY, event.altKey);
    },
    onPointerUp(event) {
      const wasDragging = dragging.current;
      reset();
      if (wasDragging) drag.drop(event.clientX, event.clientY, event.altKey);
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
