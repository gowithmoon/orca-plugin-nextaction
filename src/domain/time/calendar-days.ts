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

/** The later of two dates; `null` stands for none. */
export function laterDay(
  a: CalendarDate | null,
  b: CalendarDate | null,
): CalendarDate | null {
  if (a === null) return b;
  if (b === null) return a;
  return compareDays(a, b) >= 0 ? a : b;
}
