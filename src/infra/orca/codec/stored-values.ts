// Values the plugin block property codecs share (the completion history, the
// My Day entries): logical days as `YYYY-MM-DD` and times as ISO strings,
// which Orca reads back as `Date`s (#72 acceptance).
import type { CalendarDate } from "../../../domain/task/task";

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A `YYYY-MM-DD` string naming a day that exists, or `undefined`. */
export function parseDay(value: unknown): CalendarDate | undefined {
  if (typeof value !== "string") return undefined;
  const match = dayPattern.exec(value);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  // UTC arithmetic only checks the date exists; no time zone is involved.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return undefined;
  }
  return { year, month, day };
}

/**
 * A time, or `undefined`. Written as an ISO string, it reads back from Orca
 * as a `Date` (#72 acceptance, as for date properties in
 * plugin-panel-writes); both are taken.
 */
export function parseTime(value: unknown): Date | undefined {
  if (!(typeof value === "string" || value instanceof Date)) return undefined;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

const pad = (value: number, width: number) =>
  String(value).padStart(width, "0");

/** `day` as `YYYY-MM-DD`, as `parseDay` reads it. */
export const formatDay = (day: CalendarDate) =>
  `${pad(day.year, 4)}-${pad(day.month, 2)}-${pad(day.day, 2)}`;
