// The gantt chart's time axis (#186): the one place days turn into pixels
// and back. A scale is a parameter, not written into the drawing: each has
// its day width and how it rounds the range out (#179). The range itself is
// the read's (`ProjectGantt.range`). Dragging turns pixels back into days
// here too (`dayAt`, `daysAcross`, #180), on whatever scale is shown.
import type { GanttRange } from "../../../application/usecases/read-project-gantt";
import type { CalendarDate } from "../../../domain/task/task";
import {
  addDays,
  dayOfWeek,
  daysBetween,
  daysInMonth,
} from "../../../domain/time/calendar-days";

export type { GanttRange };

/** The time scale: day, week (the default) or month (#179). */
export type GanttScale = "day" | "week" | "month";

/**
 * A row's height in pixels: the style's `--nextaction-gantt-row` is made
 * from it, and the arrows and drops place rows by it.
 */
export const ganttRowHeight = 30;

/** The narrowest a bar is drawn, in pixels: a day on the month scale. */
const barMinWidth = 6;

/** Where a bar sits along the axis, in pixels. */
export interface BarSpan {
  readonly left: number;
  readonly width: number;
}

/**
 * A bar's place from its start's day to its due day: the one place a bar's
 * left and width are worked out, for the bar, its label and its arrows.
 */
export function barSpan(
  axis: GanttAxis,
  bar: { readonly start: CalendarDate; readonly due: CalendarDate },
): BarSpan {
  const left = axis.x(bar.start);
  return { left, width: Math.max(axis.endX(bar.due) - left, barMinWidth) };
}

/** How wide a day is on each scale, in pixels. */
const dayWidths: Record<GanttScale, number> = { day: 30, week: 14, month: 4 };

export interface GanttAxis {
  readonly scale: GanttScale;
  readonly range: GanttRange;
  /** One day's width in pixels. */
  readonly dayWidth: number;
  /** The whole axis's width in pixels. */
  readonly width: number;
  /** How many days the axis covers. */
  readonly days: number;
  /** The left edge of `date`'s day. */
  x(date: CalendarDate): number;
  /** The right edge of `date`'s day: where a bar due that day ends. */
  endX(date: CalendarDate): number;
  /** Every day of the axis, in order. */
  eachDay(): CalendarDate[];
  /**
   * The day under `x` pixels from the axis's left edge, kept within the
   * axis: where something dropped on the axis lands (#181).
   */
  dayAt(x: number): CalendarDate;
  /**
   * How many days `dx` pixels across the axis make, to the nearest whole
   * day: a drag snapping by day (#180).
   */
  daysAcross(dx: number): number;
}

/**
 * `range` rounded out to the scale's units: whole days, whole weeks (Monday
 * first) or whole months.
 */
function roundedOut(scale: GanttScale, range: GanttRange): GanttRange {
  switch (scale) {
    case "day":
      return range;
    case "week":
      return {
        start: addDays(range.start, 1 - dayOfWeek(range.start)),
        end: addDays(range.end, 7 - dayOfWeek(range.end)),
      };
    case "month":
      return {
        start: { ...range.start, day: 1 },
        end: {
          ...range.end,
          day: daysInMonth(range.end.year, range.end.month),
        },
      };
  }
}

export function createGanttAxis(
  scale: GanttScale,
  range: GanttRange,
): GanttAxis {
  const rounded = roundedOut(scale, range);
  const dayWidth = dayWidths[scale];
  const days = daysBetween(rounded.start, rounded.end) + 1;
  const x = (date: CalendarDate) => daysBetween(rounded.start, date) * dayWidth;
  return {
    scale,
    range: rounded,
    dayWidth,
    width: days * dayWidth,
    days,
    x,
    endX: (date) => x(date) + dayWidth,
    eachDay: () =>
      Array.from({ length: days }, (_, index) => addDays(rounded.start, index)),
    dayAt: (at) =>
      addDays(
        rounded.start,
        Math.min(Math.max(Math.floor(at / dayWidth), 0), days - 1),
      ),
    // `|| 0`: no -0 days.
    daysAcross: (dx) => Math.round(dx / dayWidth) || 0,
  };
}
