// The gantt chart's time axis (#186): the one place days turn into pixels
// and back. A scale is a parameter, not written into the drawing: each has
// its day width and how it rounds the range out. Only the week scale for
// now; the day and month scales come with #179, dragging (dates from
// pixels) with #180. Display only.
import type { ProjectGantt } from "../../../application/usecases/read-project-gantt";
import type { CalendarDate } from "../../../domain/task/task";
import {
  addDays,
  compareDays,
  dayOfWeek,
  daysBetween,
} from "../../../domain/time/calendar-days";

/** The time scale (GLOSSARY: 布局): only the week scale so far (#179). */
export type GanttScale = "week";

/** How wide a day is on each scale, in pixels. */
const dayWidths: Record<GanttScale, number> = { week: 14 };

/** The days the axis covers, both included. */
export interface GanttRange {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
}

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

/** Days before and after the dates drawn (GLOSSARY: 甘特图, #176). */
const margin = 14;

/**
 * The range the chart scrolls over: the project's dates, every bar and
 * today, two weeks before and after. A stand-in until the read gives it
 * (#179).
 */
export function chartRange(gantt: ProjectGantt): GanttRange {
  const dates: CalendarDate[] = [gantt.today];
  if (gantt.projectStart) dates.push(gantt.projectStart);
  if (gantt.projectDue) dates.push(gantt.projectDue);
  for (const row of gantt.rows) {
    if (row.bar) dates.push(row.bar.start, row.bar.due);
  }
  const sorted = [...dates].sort(compareDays);
  const first = sorted[0] ?? gantt.today;
  const last = sorted[sorted.length - 1] ?? gantt.today;
  return { start: addDays(first, -margin), end: addDays(last, margin) };
}

/** `range` rounded out to the scale's units: whole weeks, Monday first. */
function roundedOut(scale: GanttScale, range: GanttRange): GanttRange {
  switch (scale) {
    case "week":
      return {
        start: addDays(range.start, 1 - dayOfWeek(range.start)),
        end: addDays(range.end, 7 - dayOfWeek(range.end)),
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
