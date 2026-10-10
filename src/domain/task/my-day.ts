// My Day (GLOSSARY: 我的一天, 我的一天记录, 排期; ADR 0020). Pure: the current
// time and the day boundary are passed in; today is worked out by
// `domain/time`.
import { compareDays } from "../time/calendar-days";
import {
  type DayBoundary,
  type LogicalDayRange,
  logicalDay,
} from "../time/logical-day";
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

/**
 * The entries with today's entry scheduled at `schedule`: only that entry
 * changes, past entries are kept (ADR 0020).
 */
export function scheduleToday(
  entries: MyDayEntries,
  today: CalendarDate,
  schedule: MyDaySchedule,
): MyDayEntries {
  const todays = entryOn(entries, today);
  if (!todays || sameSchedule(todays.schedule, schedule)) return entries;
  return entries.map((entry) =>
    entry === todays ? { day: entry.day, schedule } : entry,
  );
}

/**
 * The entries with today's entry unscheduled: it stays in My Day (GLOSSARY:
 * 未排期), past entries are kept (ADR 0020). Not in, or unscheduled already,
 * the entries are returned as they are, so the caller can tell nothing
 * changed.
 */
export function unscheduleToday(
  entries: MyDayEntries,
  today: CalendarDate,
): MyDayEntries {
  const todays = entryOn(entries, today);
  if (!todays?.schedule) return entries;
  return entries.map((entry) =>
    entry === todays ? { day: entry.day } : entry,
  );
}

function sameSchedule(a: MyDaySchedule | undefined, b: MyDaySchedule): boolean {
  return (
    a !== undefined &&
    a.start.getTime() === b.start.getTime() &&
    a.end.getTime() === b.end.getTime()
  );
}

/** What the user asked for: a start and a length in minutes, not yet snapped. */
export interface ScheduleRequest {
  readonly start: Date;
  readonly minutes: number;
}

/** Starts and lengths snap to this many minutes. */
export const scheduleStepMinutes = 15;

const minuteMs = 60_000;

/** `at` snapped to the nearest step of the local clock (ADR 0012). */
function snapToStep(at: Date): Date {
  const minutes =
    Math.round((at.getMinutes() + at.getSeconds() / 60) / scheduleStepMinutes) *
    scheduleStepMinutes;
  return new Date(
    at.getFullYear(),
    at.getMonth(),
    at.getDate(),
    at.getHours(),
    minutes,
  );
}

/**
 * The schedule `request` makes on the logical day whose range is `day`
 * (GLOSSARY: 排期).
 */
export function normalizeSchedule(
  request: ScheduleRequest,
  day: LogicalDayRange,
): MyDaySchedule {
  // Within the day, leaving room for the shortest schedule before its end.
  const start = new Date(
    Math.min(
      Math.max(snapToStep(request.start).getTime(), day.start.getTime()),
      day.end.getTime() - scheduleStepMinutes * minuteMs,
    ),
  );
  const minutes = Math.max(
    scheduleStepMinutes,
    Math.round(request.minutes / scheduleStepMinutes) * scheduleStepMinutes,
  );
  const end = Math.min(start.getTime() + minutes * minuteMs, day.end.getTime());
  return { start, end: new Date(end) };
}

/**
 * Whether `schedule` holds on the logical day whose range is `day`: it lies
 * within it, from the day boundary to the next one. One outside reads as
 * unscheduled, e.g. after the user moved the day boundary (ADR 0020); the
 * notes are not rewritten.
 */
export function scheduleWithin(
  schedule: MyDaySchedule,
  day: LogicalDayRange,
): boolean {
  return (
    schedule.start.getTime() >= day.start.getTime() &&
    schedule.end.getTime() <= day.end.getTime()
  );
}
