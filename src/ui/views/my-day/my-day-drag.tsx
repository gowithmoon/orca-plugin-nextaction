// Scheduling by dragging in the My Day view (#85): an unscheduled card onto
// the timeline schedules it at the moment it is dropped (60 minutes); a
// timeline card's body moves its start, keeping its length; its top edge
// changes its start, keeping its end; its bottom edge changes its end; a
// timeline card onto the unscheduled area unschedules it. The domain snaps
// every one (`normalizeSchedule`, `moveSchedule`, `resizeScheduleStart`).
//
// These are the cards' drops in the plugin panel (`PanelDropTarget`) on the
// shared card drag (ui/drag/card-drag.tsx, #124), which handles the press,
// the threshold, the chip, the fading and letting go elsewhere (cancelled).
// The timeline (or else the panel) scrolls near its top and bottom edges.
//
// Smooth by design: while dragging only the preview on the timeline
// re-renders (when the snapped time changes); the cards, the lists and the
// view's query are left alone. The unscheduled area's highlight is set on the
// DOM directly. A drop hands what it writes to `commit`, once, in the same
// event that ends the drag. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import {
  type MyDaySchedule,
  moveSchedule,
  normalizeSchedule,
  resizeScheduleStart,
} from "../../../domain/task/my-day";
import type { Task } from "../../../domain/task/task";
import { minuteMs } from "../../../domain/time/durations";
import type { LogicalDayRange } from "../../../domain/time/logical-day";
import { formatTimeRange, shownText } from "../../components/format";
import { scrollingAncestor } from "../../drag/auto-scroll";
import type { PanelDropTarget } from "../../drag/card-drag";
import { defaultScheduleMinutes } from "./schedule-popup";
import { momentAtY, scheduleBox, yAt } from "./timeline-geometry";

/** Marks the two places to drop: "timeline" and "unscheduled" (#84). */
const dropAttribute = "data-nextaction-my-day-drop";
/** The timeline's scroller: its hours' gutter counts as the timeline too. */
const timelineScrollClass = "nextaction-timeline-scroll";
/** The timeline's track, where pixels turn into moments. */
const trackClass = "nextaction-timeline-track";
/** Set on the unscheduled area while a timeline card would drop there. */
const overAttribute = "data-drop-over";

/**
 * What is dragged: an unscheduled task onto the timeline (`add`), or a
 * scheduled one by its body (`move`), its top edge (`resize-start`) or its
 * bottom edge (`resize-end`).
 */
export type DragSubject =
  | { readonly kind: "add"; readonly task: Task }
  | {
      readonly kind: "move" | "resize-start" | "resize-end";
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
  readonly root: HTMLElement;
  readonly range: LogicalDayRange | undefined;
  /** For `move`: the pointer's distance below the card's top, in pixels. */
  readonly grab: number;
}

export interface MyDayDrag {
  subscribe(listener: () => void): () => void;
  /** The drag under way, if any: a new object only when the preview changes. */
  current(): DragSnapshot | null;
  /** The drops in the plugin panel of a card dragged as `subject`. */
  target(subject: DragSubject): PanelDropTarget;
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

/** Whether the drag is of a card's top or bottom edge. */
const isEdge = (subject: DragSubject) =>
  subject.kind === "resize-start" || subject.kind === "resize-end";

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
    case "resize-start":
      return resizeScheduleStart(subject.schedule, momentAtY(range, at), range);
    case "resize-end": {
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
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };

  /** Works out the place and the preview at the pointer; tells only changes. */
  const update = (x: number, y: number) => {
    const drag = under;
    if (!drag) return;
    const last = drag.snapshot;
    // An edge only changes the length: anywhere in the view it goes by the
    // pointer's height, so straying sideways off the narrow timeline does
    // not lose it; outside the view it cancels.
    const over = isEdge(last.subject)
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

  const target = (subject: DragSubject): PanelDropTarget => ({
    captureOnPress: isEdge(subject),
    cursor: isEdge(subject) ? "resize" : "grab",
    begin(_x, y) {
      const { root, range } = setup();
      if (!root || under) return;
      const track = trackOf(root);
      const grab =
        subject.kind === "move" && range && track
          ? y -
            track.getBoundingClientRect().top -
            yAt(range, subject.schedule.start)
          : 0;
      under = {
        snapshot: { subject, over: null, preview: null },
        root,
        range,
        grab,
      };
      emit();
    },
    move: update,
    drop(x, y) {
      update(x, y);
      const drag = under;
      if (!drag) return false;
      const { over, preview } = drag.snapshot;
      // Handed over before the drag's end renders, so both show in one frame.
      const { commit } = setup();
      if (over === "timeline" && preview) {
        const unmoved =
          subject.kind !== "add" && sameSchedule(subject.schedule, preview);
        if (!unmoved) {
          commit({ kind: "schedule", task: subject.task, schedule: preview });
        }
        return true;
      }
      if (over === "unscheduled" && subject.kind === "move") {
        commit({ kind: "unschedule", task: subject.task });
        return true;
      }
      return false;
    },
    end() {
      const drag = under;
      if (!drag) return;
      under = null;
      unscheduledAreaOf(drag.root)?.removeAttribute(overAttribute);
      emit();
    },
    // On the timeline the preview shows where it goes; an edge has no chip.
    showsChip: () => {
      const snapshot = under?.snapshot;
      return (
        !!snapshot && snapshot.over !== "timeline" && !isEdge(snapshot.subject)
      );
    },
    // The timeline, or else the panel around the view: one above the other,
    // the timeline may be out of sight.
    scrollers() {
      const root = under?.root;
      if (!root) return [];
      return [
        root.querySelector<HTMLElement>(`.${timelineScrollClass}`),
        scrollingAncestor(root),
      ].filter((scroller): scroller is HTMLElement => !!scroller);
    },
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    current: () => under?.snapshot ?? null,
    target,
  };
}

const DragContext = React.createContext<MyDayDrag | undefined>(undefined);

export const MyDayDragProvider = DragContext.Provider;

/** The view's drag, for its cards' drops in the panel. */
export function useMyDayDrag(): MyDayDrag | undefined {
  return React.useContext(DragContext);
}

const noSnapshot = () => null;
const noSubscribe = () => () => {};

/** Where the dragged task would go: on the timeline's track, snapped, with its times. */
export function TimelinePreview(props: { range: LogicalDayRange }) {
  const drag = React.useContext(DragContext);
  const snapshot = React.useSyncExternalStore(
    drag?.subscribe ?? noSubscribe,
    drag?.current ?? noSnapshot,
  );
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
