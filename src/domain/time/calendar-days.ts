// Whole-day arithmetic on calendar dates (ADR 0012): no time of day, no time
// zone. Pure.
import type { CalendarDate } from "../task/task";

const dayMs = 24 * 60 * 60 * 1000;

/** Days since the epoch; UTC, so no daylight saving shift. */
function dayNumber(date: CalendarDate): number {
  return Math.round(Date.UTC(date.year, date.month - 1, date.day) / dayMs);
}

/** Negative when `a` is before `b`, zero on the same day. */
export function compareDays(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Whole days from `from` to `to`: positive when `to` is later. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return dayNumber(to) - dayNumber(from);
}

/** The date `days` days after `date` (before it when negative). */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const at = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: at.getUTCFullYear(),
    month: at.getUTCMonth() + 1,
    day: at.getUTCDate(),
  };
}

/** The day of the week, Monday (1) to Sunday (7), as ISO 8601 numbers them. */
export function dayOfWeek(date: CalendarDate): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const sundayFirst = new Date(
    Date.UTC(date.year, date.month - 1, date.day),
  ).getUTCDay();
  return (sundayFirst === 0 ? 7 : sundayFirst) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

/** The year and month (1–12) `months` months after `month` of `year`. */
export function monthsAfter(
  year: number,
  month: number,
  months: number,
): { readonly year: number; readonly month: number } {
  const index = month - 1 + months;
  return {
    year: year + Math.floor(index / 12),
    month: (index % 12) + 1,
  };
}

/** The number of days in a month (1–12) of a year. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The later of two dates; `null` stands for none. */
export function laterDay(
  a: CalendarDate | null,
  b: CalendarDate | null,
): CalendarDate | null {
  if (a === null) return b;
  if (b === null) return a;
  return compareDays(a, b) >= 0 ? a : b;
}
