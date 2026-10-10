// My Day (GLOSSARY: 我的一天, 我的一天记录, 排期; ADR 0020). Pure: the current
// time and the day boundary are passed in; today is worked out by
// `domain/time`.
import { compareDays } from "../time/calendar-days";
import { type DayBoundary, logicalDay } from "../time/logical-day";
import type { CalendarDate } from "./task";

/** When the task is to be done that day: absolute times, `end` after `start`. */
export interface MyDaySchedule {
  readonly start: Date;
  readonly end: Date;
}

/**
 * One logical day the task was in My Day, scheduled or not (GLOSSARY:
 * 未排期 when `schedule` is absent).
 */
export interface MyDayEntry {
  readonly day: CalendarDate;
  readonly schedule?: MyDaySchedule;
}

/**
 * A task's My Day entries, oldest first, at most one per logical day. Past
 * entries are kept as they are (ADR 0020).
 */
export type MyDayEntries = readonly MyDayEntry[];

/**
 * What a task's My Day entries read as. A task without any reads as no
 * entries. `unreadable`: something is stored that this plugin cannot read
 * (an unknown version, or damaged); it is kept as it is and cannot be
 * written.
 */
export type MyDayRead =
  | { kind: "readable"; entries: MyDayEntries }
  | { kind: "unreadable"; reason: string };

/** The entry of the logical day `day`, or `undefined` for none. */
export function entryOn(
  entries: MyDayEntries,
  day: CalendarDate,
): MyDayEntry | undefined {
  return entries.find((entry) => compareDays(entry.day, day) === 0);
}

/** The entry of the current logical day, or `undefined` for none. */
export function todayEntry(
  entries: MyDayEntries,
  now: Date,
  boundary: DayBoundary,
): MyDayEntry | undefined {
  return entryOn(entries, logicalDay(now, boundary));
}

/**
 * The entries with the task added to My Day on `today` (the current logical
 * day), unscheduled: a new entry goes at the end. Already in, the entries
 * are returned as they are, so the caller can tell nothing changed.
 */
export function addToday(
  entries: MyDayEntries,
  today: CalendarDate,
): MyDayEntries {
  return entryOn(entries, today) ? entries : [...entries, { day: today }];
}

/**
 * The entries with the task removed from My Day on `today`: only that day's
 * entry goes, past entries are kept (ADR 0020). Not in, the entries are
 * returned as they are, so the caller can tell nothing changed.
 */
export function removeToday(
  entries: MyDayEntries,
  today: CalendarDate,
): MyDayEntries {
  return entryOn(entries, today)
    ? entries.filter((entry) => compareDays(entry.day, today) !== 0)
    : entries;
}
