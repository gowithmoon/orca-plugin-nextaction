// Dragging a bar of the gantt chart to change its task's dates (#180): the
// middle moves the whole bar, an end changes that date only, snapping by
// day; "10月20日 → 10月27日" shows beside the bar meanwhile. Letting go
// writes both dates the chart shows, a borrowed end (#177) becoming the
// task's own, in one edit task write and one undo; the task changes signal
// reads the chart again. A press is a drag only once the pointer has gone a
// few pixels: a click still opens the task panel. A bracket never drags.
// The chart's own drag, not the shared card drag (#176): its rows feed the
// arrows (#182), the labels and the narrow tier's names, so all of them
// follow the bar while it is dragged. Pixels become days only through the
// axis (`daysAcross`), on whatever scale shows (#179).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  DatedBar,
  GanttRow,
} from "../../../application/usecases/read-project-gantt";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
import {
  addDays,
  compareDays,
  daysBetween,
} from "../../../domain/time/calendar-days";
import { t } from "../../../shared/l10n/l10n";
import { scrollNearEdge } from "../../drag/auto-scroll";
import type { GanttAxis, GanttRange } from "./gantt-axis";

/** How far the pointer goes before a press is a drag, as the card drag's. */
const dragThreshold = 4;
/** Marks the bar's ends; the middle has none. */
const endAttribute = "data-nextaction-gantt-end";
/** Set on the document root while dragging, for the cursor everywhere. */
const draggingAttribute = "data-nextaction-gantt-dragging";

/** What a press on a bar drags: all of it, or one end. */
type BarDragEnd = "move" | "start" | "due";

/** A bar's two dates. */
export interface BarDates {
  readonly start: CalendarDate;
  readonly due: CalendarDate;
}

/**
 * The bar dragged and the dates it shows. `settled`: let go, written or
 * being written; it shows so until the chart is read again.
 */
export interface GanttDragged extends BarDates {
  readonly id: TaskId;
  readonly settled: boolean;
}

/** Whether two bars show the same dates. */
export function sameDates(a: BarDates, b: BarDates): boolean {
  return compareDays(a.start, b.start) === 0 && compareDays(a.due, b.due) === 0;
}

function clampDay(
  day: CalendarDate,
  first: CalendarDate,
  last: CalendarDate,
): CalendarDate {
  if (compareDays(day, first) < 0) return first;
  if (compareDays(day, last) > 0) return last;
  return day;
}

/**
 * The dates `from` dragged `days` days by `end`, kept on the axis: moved,
 * both go; one end never passes the other, a bar at least a day long.
 */
function draggedDates(
  from: BarDates,
  end: BarDragEnd,
  days: number,
  range: GanttRange,
): BarDates {
  switch (end) {
    case "move": {
      const by = Math.min(
        Math.max(days, daysBetween(from.start, range.start)),
        daysBetween(from.due, range.end),
      );
      return { start: addDays(from.start, by), due: addDays(from.due, by) };
    }
    case "start":
      return {
        start: clampDay(addDays(from.start, days), range.start, from.due),
        due: from.due,
      };
    case "due":
      return {
        start: from.start,
        due: clampDay(addDays(from.due, days), from.start, range.end),
      };
  }
}

/**
 * The rows as the chart shows them while a bar is dragged: that row's bar
 * at the dragged dates, both its own (nothing borrowed), the hatching from
 * its new start. Everything drawn from the rows follows it.
 */
export function draggedRows(
  rows: readonly GanttRow[],
  dragged: GanttDragged | null,
): readonly GanttRow[] {
  if (!dragged) return rows;
  return rows.map((row) => {
    if (row.task.id !== dragged.id || row.bar.kind !== "bar") return row;
    const held = row.heldBack;
    return {
      ...row,
      bar: {
        kind: "bar",
        start: dragged.start,
        due: dragged.due,
        borrowed: "none",
      },
      heldBack:
        held && compareDays(dragged.start, held.until) < 0
          ? { from: dragged.start, until: held.until }
          : null,
    };
  });
}

/** What the chart gives its bars' drags. */
export interface GanttBarDragDeps {
  /** The chart's scroller: dragging near its left or right edge scrolls it. */
  scroller(): HTMLElement | null;
  /** The bar dragged, if any. */
  readonly dragged: GanttDragged | null;
  /** The bar shows these dates while dragged; `null`: the drag is cancelled. */
  drag(id: TaskId, dates: BarDates | null): void;
  /** Let go at `dates`; `from`: the bar as it was pressed. */
  drop(id: TaskId, dates: BarDates, from: DatedBar): void;
}

export const GanttBarDragContext = React.createContext<
  GanttBarDragDeps | undefined
>(undefined);

/** Whether the row's bar is being dragged now (not yet let go). */
export function useBarDragging(id: TaskId): boolean {
  const dragged = React.useContext(GanttBarDragContext)?.dragged;
  return dragged?.id === id && !dragged.settled;
}

interface Press {
  readonly x: number;
  readonly scrollLeft: number;
  readonly end: BarDragEnd;
  readonly from: DatedBar;
  /** Where the pointer is now. */
  point: { x: number; y: number };
  dragging: boolean;
  /** The dates shown last. */
  shown: BarDates;
  /** The frame that scrolls the chart near its edges, while dragging. */
  frame: number | null;
}

/**
 * The pointer handlers that make a row's bar draggable; spread them on it,
 * the bar holding `barEnds()`. Nothing for a bracket, or outside a chart.
 */
export function useBarDrag(
  row: GanttRow,
  axis: GanttAxis,
): React.ButtonHTMLAttributes<HTMLButtonElement> {
  const deps = React.useContext(GanttBarDragContext);
  const latest = React.useRef({ deps, row, axis });
  latest.current = { deps, row, axis };
  const press = React.useRef<Press | null>(null);
  /** The click ending a drag opens nothing. */
  const clickTaken = React.useRef(false);

  const stop = React.useCallback(() => {
    const current = press.current;
    press.current = null;
    if (current?.frame != null) cancelAnimationFrame(current.frame);
    if (current?.dragging) {
      document.documentElement.removeAttribute(draggingAttribute);
    }
    return current;
  }, []);
  // The chart going away mid-drag (another project, the panel closing).
  React.useEffect(
    () => () => {
      stop();
    },
    [stop],
  );

  if (!deps || row.bar.kind !== "bar") return {};
  const id = row.task.id;

  /** The dates where the pointer is now, shown if they changed. */
  const update = () => {
    const current = press.current;
    const { deps: now, axis: shownAxis } = latest.current;
    if (!current || !now) return;
    const scroller = now.scroller();
    const dx =
      current.point.x -
      current.x +
      (scroller ? scroller.scrollLeft - current.scrollLeft : 0);
    const dates = draggedDates(
      current.from,
      current.end,
      shownAxis.daysAcross(dx),
      shownAxis.range,
    );
    if (sameDates(dates, current.shown)) return;
    current.shown = dates;
    now.drag(id, dates);
  };

  /** One frame while dragging: near the chart's left or right edge it scrolls. */
  const scrollFrame = () => {
    const current = press.current;
    if (!current) return;
    const scroller = latest.current.deps?.scroller();
    if (
      scroller &&
      scrollNearEdge([scroller], current.point.x, current.point.y, "x")
    ) {
      update();
    }
    current.frame = requestAnimationFrame(scrollFrame);
  };

  const cancel = () => {
    const current = stop();
    if (current?.dragging) latest.current.deps?.drag(id, null);
  };

  return {
    onPointerDown(event) {
      clickTaken.current = false;
      stop();
      const { target } = event;
      const bar = latest.current.row.bar;
      if (event.button !== 0 || bar.kind !== "bar") return;
      const end =
        target instanceof Element
          ? target.closest(`[${endAttribute}]`)?.getAttribute(endAttribute)
          : null;
      const scroller = deps.scroller();
      press.current = {
        x: event.clientX,
        scrollLeft: scroller?.scrollLeft ?? 0,
        end: end === "start" || end === "due" ? end : "move",
        from: bar,
        point: { x: event.clientX, y: event.clientY },
        dragging: false,
        shown: bar,
        frame: null,
      };
      // Held from the press on: an end is a thin strip the pointer leaves
      // before it has gone far enough. The click still lands on the bar.
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event) {
      const current = press.current;
      if (!current) return;
      current.point = { x: event.clientX, y: event.clientY };
      if (!current.dragging) {
        // Let go somewhere the bar did not hear.
        if ((event.buttons & 1) === 0) {
          stop();
          return;
        }
        // Only sideways counts: dates lie along the axis.
        if (Math.abs(event.clientX - current.x) < dragThreshold) return;
        current.dragging = true;
        document.documentElement.setAttribute(
          draggingAttribute,
          current.end === "move" ? "move" : "resize",
        );
        // Shown as written from now on, a borrowed end too.
        current.shown = { start: current.from.start, due: current.from.due };
        latest.current.deps?.drag(id, current.shown);
        current.frame = requestAnimationFrame(scrollFrame);
      }
      update();
    },
    onPointerUp() {
      const current = stop();
      if (!current?.dragging) return;
      clickTaken.current = true;
      latest.current.deps?.drop(id, current.shown, current.from);
    },
    onPointerCancel: cancel,
    // Released by anything else (e.g. the window losing focus): cancelled.
    onLostPointerCapture: cancel,
    onClickCapture(event) {
      // From the keyboard (no pointer, `detail` 0): never a drag's.
      if (event.detail === 0 || !clickTaken.current) return;
      clickTaken.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

/** The widest a bar's end is, in pixels; narrower on a short bar. */
const endWidth = 7;

/**
 * The bar's two ends, dragged to change that date only. A bar too short
 * for them and a middle only moves.
 */
export function BarEnds(props: { width: number }) {
  const width = Math.min(endWidth, Math.floor(props.width / 4));
  if (width < 3) return null;
  return (
    <>
      <span
        className="nextaction-gantt-bar-end"
        data-nextaction-gantt-end="start"
        data-side="start"
        style={{ width }}
        aria-hidden="true"
      />
      <span
        className="nextaction-gantt-bar-end"
        data-nextaction-gantt-end="due"
        data-side="due"
        style={{ width }}
        aria-hidden="true"
      />
    </>
  );
}

/** A day as "10月20日", the year added when it is not this year's. */
export function dayLabel(date: CalendarDate, today: CalendarDate): string {
  const values = {
    year: String(date.year),
    month: String(date.month),
    day: String(date.day),
  };
  return date.year === today.year
    ? t("${month}/${day}", values)
    : t("${year}/${month}/${day}", values);
}

/**
 * The dates of the bar being dragged, just after its end: what letting go
 * writes. Nothing for the other rows.
 */
export function GanttDragDates(props: {
  row: GanttRow;
  axis: GanttAxis;
  today: CalendarDate;
}) {
  const { row, axis, today } = props;
  const dragging = useBarDragging(row.task.id);
  if (!dragging || row.bar.kind !== "bar") return null;
  return (
    <span
      className="nextaction-gantt-drag-dates"
      style={{ left: axis.endX(row.bar.due) + 6 }}
      aria-live="polite"
    >
      {t("${start} → ${due}", {
        start: dayLabel(row.bar.start, today),
        due: dayLabel(row.bar.due, today),
      })}
    </span>
  );
}
