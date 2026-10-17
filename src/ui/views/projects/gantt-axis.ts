// The gantt chart's time axis (#186): the one place days turn into pixels
// and back. A scale is a parameter, not written into the drawing: each has
// its day width and how it rounds the range out (#179). The range itself is
// the read's (`ProjectGantt.range`); dragging (dates from pixels) comes
// with #180. Display only.
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
  };
}
