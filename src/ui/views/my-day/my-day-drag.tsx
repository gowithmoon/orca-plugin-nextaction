// Scheduling by dragging in the My Day view (#85): an unscheduled card onto
// the timeline schedules it at the moment it is dropped (60 minutes); a
// timeline card's body moves its start, keeping its length; its bottom edge
// changes its length; a timeline card onto the unscheduled area unschedules
// it. The domain snaps every one (`normalizeSchedule`, `moveSchedule`).
//
// As the all tasks view's dragging (task-drag.tsx): pointer events with
// pointer capture, not the browser's drag and drop (move-blocks 64c); a
// press only turns into a drag once the pointer has gone a few pixels, so a
// click, the buttons and the right-click menu stay as they are; on an
// unscheduled card's text a press selects text, and turns into a drag only
// once the pointer leaves the card. The timeline (or else the panel) scrolls
// near its top and bottom edges; letting go outside the view cancels.
//
// Smooth by design: while dragging only two small parts re-render, the
// preview on the timeline (when the snapped time changes) and the chip under
// the pointer (when it shows or hides); the cards, the lists and the view's
// query are left alone. The source card's fading, the unscheduled area's
// highlight and the chip's position are set on the DOM directly. A drop hands
// what it writes to `commit`, once, in the same event that ends the drag.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import {
  type MyDaySchedule,
  moveSchedule,
  normalizeSchedule,
} from "../../../domain/task/my-day";
import type { Task } from "../../../domain/task/task";
import type { LogicalDayRange } from "../../../domain/time/logical-day";
import { formatTimeRange, shownText } from "../../components/format";
import { defaultScheduleMinutes } from "./schedule-popup";
import { momentAtY, scheduleBox, yAt } from "./timeline-geometry";

/** How far the pointer goes before a press is a drag. */
const dragThreshold = 4;
/** How close to a scroller's top or bottom edge it scrolls. */
const scrollEdge = 40;
/** The most it scrolls per frame, right at the edge. */
const scrollStep = 14;
const minuteMs = 60_000;

/** Marks the two places to drop: "timeline" and "unscheduled" (#84). */
const dropAttribute = "data-nextaction-my-day-drop";
/** The timeline's scroller: its hours' gutter counts as the timeline too. */
const timelineScrollClass = "nextaction-timeline-scroll";
/** The timeline's track, where pixels turn into moments. */
const trackClass = "nextaction-timeline-track";
/** Set on the card being dragged, which stays in place, faded. */
const sourceAttribute = "data-nextaction-drag-source";
/** Set on the unscheduled area while a timeline card would drop there. */
const overAttribute = "data-drop-over";
/** Set on the view's areas while dragging: no text selection, a grabbing cursor. */
const draggingAttribute = "data-dragging";
/** Presses on these are their own, never a drag. */
const ownPress = "button, a, input, textarea, select, [contenteditable]";
/** Text a press selects, unless the pointer leaves the card. */
const selectableText = ".nextaction-task-card-text";

/**
 * What is dragged: an unscheduled task onto the timeline (`add`), or a
 * scheduled one by its body (`move`) or its bottom edge (`resize`).
 */
export type DragSubject =
  | { readonly kind: "add"; readonly task: Task }
  | {
      readonly kind: "move" | "resize";
      readonly task: Task;
      readonly schedule: MyDaySchedule;
    };

type DropPlace = "timeline" | "unscheduled";

/** The drag under way, as the preview shows it. */
interface DragSnapshot {
  readonly subject: DragSubject;
  readonly over: DropPlace | null;
  /** Where it would go on the timeline, snapped; `null` off the timeline. */
  readonly preview: MyDaySchedule | null;
}

/** What a drop writes, once. */
export type MyDayDrop =
  | {
      readonly kind: "schedule";
      readonly task: Task;
      readonly schedule: MyDaySchedule;
    }
  | { readonly kind: "unschedule"; readonly task: Task };

/** What the drag needs from the view, read when it is used. */
export interface MyDayDragSetup {
  /** The view's areas, holding the two places to drop. */
  readonly root: HTMLElement | null;
  /** Today's range the view read by. */
  readonly range: LogicalDayRange | undefined;
  readonly commit: (drop: MyDayDrop) => void;
}

interface Under {
  readonly snapshot: DragSnapshot;
  readonly source: HTMLElement;
  readonly root: HTMLElement;
  readonly range: LogicalDayRange | undefined;
  /** For `move`: the pointer's distance below the card's top, in pixels. */
  readonly grab: number;
}

export interface MyDayDrag {
  subscribe(listener: () => void): () => void;
  /** The drag under way, if any: a new object only when the preview changes. */
  current(): DragSnapshot | null;
  /** The latest pointer position. */
  pointer(): { x: number; y: number };
  /** Whether the card being dragged is still in the view. */
  sourceConnected(): boolean;
  begin(subject: DragSubject, source: HTMLElement, x: number, y: number): void;
  move(x: number, y: number): void;
  /** What lies under a still pointer moved (scrolling). */
  refresh(): void;
  drop(x: number, y: number): void;
  cancel(): void;
  /** Whether a click ends a drag (and so is no click); asks once. */
  takeClick(): boolean;
  /** A new press: a click left over from a drag is gone. */
  pressed(): void;
  /** Places the chip under the pointer, within the view's areas. */
  placeChip(chip: HTMLElement | null): void;
}

function sameSchedule(
  a: MyDaySchedule | null,
  b: MyDaySchedule | null,
): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.start.getTime() === b.start.getTime() &&
      a.end.getTime() === b.end.getTime())
  );
}

const trackOf = (root: HTMLElement) =>
  root.querySelector<HTMLElement>(`.${trackClass}`);

const unscheduledAreaOf = (root: HTMLElement) =>
  root.querySelector<HTMLElement>(`[${dropAttribute}="unscheduled"]`);

/** Whether the point lies on `root` (the plugin panel's view, not the notes). */
function withinRoot(root: HTMLElement, x: number, y: number): boolean {
  const element = document.elementFromPoint(x, y);
  return element !== null && root.contains(element);
}

/** The place to drop under the point, only within `root`. */
function placeAt(root: HTMLElement, x: number, y: number): DropPlace | null {
  const element = document.elementFromPoint(x, y);
  if (!element || !root.contains(element)) return null;
  const place = element.closest(`[${dropAttribute}], .${timelineScrollClass}`);
  if (!place || !root.contains(place)) return null;
  if (place.classList.contains(timelineScrollClass)) return "timeline";
  const value = place.getAttribute(dropAttribute);
  return value === "timeline" || value === "unscheduled" ? value : null;
}

/** Where the subject would go with the pointer at `y`, snapped by the domain. */
function previewAt(drag: Under, y: number): MyDaySchedule | null {
  const { range } = drag;
  const track = trackOf(drag.root);
  if (!range || !track) return null;
  const at = y - track.getBoundingClientRect().top;
  const { subject } = drag.snapshot;
  switch (subject.kind) {
    case "add":
      return normalizeSchedule(
        { start: momentAtY(range, at), minutes: defaultScheduleMinutes },
        range,
      );
    case "move":
      return moveSchedule(
        subject.schedule,
        momentAtY(range, at - drag.grab),
        range,
      );
    case "resize": {
      const end = momentAtY(range, at).getTime();
      return normalizeSchedule(
        {
          start: subject.schedule.start,
          minutes: (end - subject.schedule.start.getTime()) / minuteMs,
        },
        range,
      );
    }
  }
}

/** The drag of one My Day view: the state outside React, so a move renders nothing. */
export function createMyDayDrag(setup: () => MyDayDragSetup): MyDayDrag {
  let under: Under | null = null;
  let point = { x: 0, y: 0 };
  /** The click that follows a drag's end is not a click. */
  let clickTaken = false;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };

  /** Works out the place and the preview at the pointer; tells only changes. */
  const update = () => {
    const drag = under;
    if (!drag) return;
    const { x, y } = point;
    const last = drag.snapshot;
    // The edge only changes the length: anywhere in the view it goes by the
    // pointer's height, so straying sideways off the narrow timeline does
    // not lose it; outside the view it cancels.
    const over =
      last.subject.kind === "resize"
        ? withinRoot(drag.root, x, y)
          ? "timeline"
          : null
        : placeAt(drag.root, x, y);
    const preview = over === "timeline" ? previewAt(drag, y) : null;
    if (last.over === over && sameSchedule(last.preview, preview)) return;
    under = { ...drag, snapshot: { ...last, over, preview } };
    unscheduledAreaOf(drag.root)?.toggleAttribute(
      overAttribute,
      over === "unscheduled" && last.subject.kind === "move",
    );
    emit();
  };

  /** Ends the drag, leaving the DOM as it was. */
  const end = (): Under | null => {
    const drag = under;
    if (!drag) return null;
    under = null;
    clickTaken = true;
    drag.source.removeAttribute(sourceAttribute);
    drag.root.removeAttribute(draggingAttribute);
    unscheduledAreaOf(drag.root)?.removeAttribute(overAttribute);
    return drag;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    current: () => under?.snapshot ?? null,
    pointer: () => point,
    sourceConnected: () => under?.source.isConnected ?? false,
    begin(subject, source, x, y) {
      const { root, range } = setup();
      if (!root || under) return;
      point = { x, y };
      const track = trackOf(root);
      const grab =
        subject.kind === "move" && range && track
          ? y -
            track.getBoundingClientRect().top -
            yAt(range, subject.schedule.start)
          : 0;
      under = {
        snapshot: { subject, over: null, preview: null },
        source,
        root,
        range,
        grab,
      };
      source.setAttribute(sourceAttribute, "");
      // Its kind picks the cursor (my-day-style.ts).
      root.setAttribute(draggingAttribute, subject.kind);
      emit();
      update();
    },
    move(x, y) {
      if (!under) return;
      point = { x, y };
      // A press on text may have begun selecting it; dragging is not selecting.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();
      update();
    },
    refresh: update,
    drop(x, y) {
      if (!under) return;
      point = { x, y };
      update();
      const drag = end();
      if (!drag) return;
      const { subject, over, preview } = drag.snapshot;
      // Handed over before the drag's end renders, so both show in one frame.
      const { commit } = setup();
      if (over === "timeline" && preview) {
        const unmoved =
          subject.kind !== "add" && sameSchedule(subject.schedule, preview);
        if (!unmoved) {
          commit({ kind: "schedule", task: subject.task, schedule: preview });
        }
      } else if (over === "unscheduled" && subject.kind === "move") {
        commit({ kind: "unschedule", task: subject.task });
      }
      emit();
    },
    cancel() {
      if (end()) emit();
    },
    takeClick() {
      const taken = clickTaken;
      clickTaken = false;
      return taken;
    },
    pressed() {
      clickTaken = false;
    },
    placeChip(chip) {
      const root = under?.root;
      if (!chip || !root) return;
      // Within the areas: the view is a size container, which would hold a
      // fixed chip inside it anyway, and one overflowing would scroll it.
      const box = root.getBoundingClientRect();
      const left = Math.max(
        0,
        Math.min(point.x - box.left + 12, box.width - chip.offsetWidth),
      );
      const top = Math.max(
        0,
        Math.min(point.y - box.top + 8, box.height - chip.offsetHeight),
      );
      chip.style.setProperty("transform", `translate(${left}px, ${top}px)`);
    },
  };
}

const DragContext = React.createContext<MyDayDrag | undefined>(undefined);

export const MyDayDragProvider = DragContext.Provider;

const noSnapshot = () => null;
const noSubscribe = () => () => {};

/** The drag under way, re-rendering only when its preview changes. */
function useDragSnapshot(drag: MyDayDrag | undefined): DragSnapshot | null {
  return React.useSyncExternalStore(
    drag?.subscribe ?? noSubscribe,
    drag?.current ?? noSnapshot,
  );
}

/** Whether the point lies outside the element's box. */
function outside(element: Element, x: number, y: number): boolean {
  const box = element.getBoundingClientRect();
  return x < box.left || x > box.right || y < box.top || y > box.bottom;
}

/**
 * The pointer handlers that make an element a drag source; `pick` says what
 * a press on `target` drags (`null`: nothing). Renders nothing while
 * dragging: the state is in refs and in the drag.
 */
export function useDragSource(
  pick: (target: Element) => DragSubject | null,
): React.DOMAttributes<HTMLElement> {
  const drag = React.useContext(DragContext);
  /** Where the press began and what it drags, while pressed. */
  const press = React.useRef<{
    readonly x: number;
    readonly y: number;
    readonly subject: DragSubject;
    /** On selectable text: a drag only once the pointer leaves the card. */
    readonly onText: boolean;
  } | null>(null);
  const dragging = React.useRef(false);
  if (!drag) return {};

  const reset = () => {
    press.current = null;
    dragging.current = false;
  };

  return {
    onPointerDown(event) {
      drag.pressed();
      reset();
      const { target } = event;
      if (event.button !== 0 || !(target instanceof Element)) return;
      if (target.closest(ownPress)) return;
      const subject = pick(target);
      if (!subject) return;
      // Not prevented: clicks, double-click selection and focus stay as they are.
      press.current = {
        x: event.clientX,
        y: event.clientY,
        subject,
        onText: target.closest(selectableText) !== null,
      };
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
        const far = start.onText
          ? outside(event.currentTarget, x, y)
          : Math.hypot(x - start.x, y - start.y) >= dragThreshold;
        if (!far) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.begin(start.subject, event.currentTarget, x, y);
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
  };
}

/** Where the dragged task would go: on the timeline's track, snapped, with its times. */
export function TimelinePreview(props: { range: LogicalDayRange }) {
  const snapshot = useDragSnapshot(React.useContext(DragContext));
  const preview = snapshot?.preview;
  if (!snapshot || !preview) return null;
  const box = scheduleBox(props.range, preview);
  const text = shownText(snapshot.subject.task);
  return (
    <div
      className="nextaction-timeline-preview"
      aria-hidden="true"
      style={{ top: `${box.top}px`, height: `${box.height}px` }}
    >
      <span className="nextaction-timeline-preview-times">
        {formatTimeRange(preview)}
      </span>
      <span className="nextaction-timeline-preview-text">{text.text}</span>
    </div>
  );
}

/**
 * The dragged task under the pointer while it is off the timeline (on it,
 * the preview shows where it goes); moved on the DOM once a frame, not by
 * rendering.
 */
export function DragChip() {
  const drag = React.useContext(DragContext);
  const snapshot = useDragSnapshot(drag);
  const chip = React.useRef<HTMLDivElement>(null);
  const shown =
    snapshot !== null &&
    snapshot.over !== "timeline" &&
    snapshot.subject.kind !== "resize";
  React.useLayoutEffect(() => {
    if (shown) drag?.placeChip(chip.current);
  });
  React.useEffect(() => {
    if (!drag || !shown) return;
    let frame = 0;
    const step = () => {
      drag.placeChip(chip.current);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [drag, shown]);
  if (!snapshot || !shown) return null;
  return (
    <div ref={chip} className="nextaction-my-day-drag-chip" aria-hidden="true">
      {shownText(snapshot.subject.task).text}
    </div>
  );
}

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

/** How far to scroll `scroller` this frame with the pointer at (x, y). */
function scrollAmount(scroller: HTMLElement, x: number, y: number): number {
  const box = scroller.getBoundingClientRect();
  if (x < box.left || x > box.right) return 0;
  const bottom = scroller.scrollHeight - scroller.clientHeight;
  if (y >= box.top && y < box.top + scrollEdge && scroller.scrollTop > 0) {
    return -Math.ceil(((box.top + scrollEdge - y) / scrollEdge) * scrollStep);
  }
  if (
    y <= box.bottom &&
    y > box.bottom - scrollEdge &&
    scroller.scrollTop < bottom
  ) {
    return Math.ceil(
      ((y - (box.bottom - scrollEdge)) / scrollEdge) * scrollStep,
    );
  }
  return 0;
}

/**
 * While dragging: scrolls the timeline while the pointer stays near its top
 * or bottom edge, one step a frame, or else the panel around the view (one
 * above the other, the timeline may be out of sight). Stops with the drag,
 * and when the view goes (the panel closing or the plugin unloading unmounts
 * it; ARCHITECTURE §4's exception for component timers).
 */
export function DragWatch(props: { root: React.RefObject<HTMLElement> }) {
  const drag = React.useContext(DragContext);
  const dragging = useDragSnapshot(drag) !== null;
  React.useEffect(() => {
    const root = props.root.current;
    if (!drag || !dragging || !root) return;
    const scrollers = [
      root.querySelector<HTMLElement>(`.${timelineScrollClass}`),
      scrollingAncestor(root),
    ].filter((scroller): scroller is HTMLElement => !!scroller);
    let frame = 0;
    const step = () => {
      // The card went away (e.g. the task was removed in the notes): its
      // pointer events with it, so nothing would end the drag.
      if (!drag.sourceConnected()) {
        drag.cancel();
        return;
      }
      const { x, y } = drag.pointer();
      for (const scroller of scrollers) {
        const by = scrollAmount(scroller, x, y);
        if (by === 0) continue;
        scroller.scrollTop += by;
        drag.refresh();
        break;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [drag, dragging, props.root]);
  return null;
}
