// The day boundary and the logical day (GLOSSARY: Day Boundary, Logical Day;
// ADR 0005). Pure: the current time is passed in as `now`.
import type { CalendarDate } from "../task/task";

/** A time of day: hours 0–23, minutes 0–59. */
export interface DayBoundary {
  readonly hours: number;
  readonly minutes: number;
}

/** Used until the user sets another boundary. */
export const defaultDayBoundary: DayBoundary = { hours: 5, minutes: 0 };

/**
 * The logical day `now` falls in. It is named after the calendar day it
 * starts on: before that day's boundary, `now` still belongs to the logical
 * day named after the previous calendar day. Local time only (ADR 0012).
 */
export function logicalDay(now: Date, boundary: DayBoundary): CalendarDate {
  const beforeBoundary =
    now.getHours() * 60 + now.getMinutes() <
    boundary.hours * 60 + boundary.minutes;
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (beforeBoundary) day.setDate(day.getDate() - 1);
  return {
    year: day.getFullYear(),
    month: day.getMonth() + 1,
    day: day.getDate(),
  };
}

/** The moments a logical day holds: from `start` on, up to but not `end`. */
export interface LogicalDayRange {
  readonly start: Date;
  readonly end: Date;
}

/**
 * The time range of the logical day `day`: from its day boundary to the next
 * day's boundary (GLOSSARY: 日界线). Local time only (ADR 0012).
 */
export function logicalDayRange(
  day: CalendarDate,
  boundary: DayBoundary,
): LogicalDayRange {
  const at = (offset: number) =>
    new Date(
      day.year,
      day.month - 1,
      day.day + offset,
      boundary.hours,
      boundary.minutes,
    );
  return { start: at(0), end: at(1) };
}
