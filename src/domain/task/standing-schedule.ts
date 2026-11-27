// The standing schedule (GLOSSARY: 常设排期; ADR 0029): where a recurring
// task sits in My Day on each day it is to be done, by time of day. Pure:
// the logical day and the day boundary are passed in.
import { activeRule, isNotAdvanced } from "../recurrence/recurrence";
import { compareDays } from "../time/calendar-days";
import {
  type DayBoundary,
  type LogicalDayRange,
  momentOn,
} from "../time/logical-day";
import { sameTimeOfDay, type TimeOfDay } from "../time/time-of-day";
import {
  entryOn,
  type MyDayEntries,
  type MyDaySchedule,
  scheduleStepMinutes,
} from "./my-day";
import type { CalendarDate, Task } from "./task";

/**
 * A start and an end time of day, on 15-minute steps, the end after the
 * start within one logical day. Times of day, not moments, so neither
 * daylight saving time nor a change of time zone moves it (ADR 0029).
 */
export interface StandingSchedule {
  readonly start: TimeOfDay;
  readonly end: TimeOfDay;
  /**
   * The logical day the user last removed the task from My Day on (#245):
   * that day it is not brought in. Only the last one is kept; on any other
   * day it says nothing, so it is never cleared but by adding it back.
   */
  readonly removedOn?: CalendarDate;
}

/**
 * What a task's standing schedule reads as. `unreadable`: something is
 * stored that this plugin cannot read (an unknown version, or damaged); it
 * is kept as it is and cannot be written.
 */
export type StandingScheduleRead =
  | { readonly kind: "none" }
  | { readonly kind: "schedule"; readonly schedule: StandingSchedule }
  | { readonly kind: "unreadable"; readonly reason: string };

/** No standing schedule: what a task reads as without one. */
export const noStandingSchedule: StandingScheduleRead = { kind: "none" };

/**
 * `next` replacing `current` with the day the task was removed from My Day
 * on kept (#245): changing the times does not add it back that day. `null`
 * (cleared) stays `null`.
 */
export function keepingRemoval(
  next: StandingSchedule | null,
  current: StandingScheduleRead,
): StandingSchedule | null {
  if (!next || current.kind !== "schedule") return next;
  const { removedOn } = current.schedule;
  return removedOn ? { ...next, removedOn } : next;
}

/**
 * `schedule` on the logical day whose range is `day`: its times on the
 * clock within that day, those before the day boundary at its end (ADR
 * 0029); an end on the boundary itself is the day's end. `undefined` when
 * the end does not come after the start there, the times crossing the day
 * boundary (e.g. after the user moved it): the task reads as unscheduled
 * that day, as a My Day entry's schedule outside the day does (ADR 0020).
 */
export function standingScheduleOn(
  schedule: StandingSchedule,
  day: LogicalDayRange,
): MyDaySchedule | undefined {
  const start = momentOn(day, schedule.start);
  const placedEnd = momentOn(day, schedule.end);
  const end = placedEnd.getTime() === day.start.getTime() ? day.end : placedEnd;
  if (sameTimeOfDay(schedule.start, schedule.end)) return undefined;
  return end.getTime() > start.getTime() ? { start, end } : undefined;
}

const minutesPerDay = 24 * 60;

const minuteOfDay = (time: TimeOfDay) => time.hours * 60 + time.minutes;

/**
 * Why `schedule` cannot be saved, or `undefined` when it can: a time off the
 * 15-minute steps the timeline snaps to (`off-step`); the start and the end
 * the same time of day (`empty`); the end not after the start within one
 * logical day from the day `boundary` on (`crosses-day-boundary`). Times
 * before the boundary count at the end of the logical day, an end on the
 * boundary itself at its very end (ADR 0029).
 */
export function standingScheduleProblem(
  schedule: StandingSchedule,
  boundary: DayBoundary,
): StandingScheduleProblem | undefined {
  const onStep = (time: TimeOfDay) => time.minutes % scheduleStepMinutes === 0;
  if (!onStep(schedule.start) || !onStep(schedule.end)) return "off-step";
  // Minutes from the boundary, within one logical day.
  const fromBoundary = (time: TimeOfDay) =>
    (minuteOfDay(time) - minuteOfDay(boundary) + minutesPerDay) % minutesPerDay;
  const start = fromBoundary(schedule.start);
  const end = fromBoundary(schedule.end) || minutesPerDay;
  if (sameTimeOfDay(schedule.start, schedule.end)) return "empty";
  return end > start ? undefined : "crosses-day-boundary";
}

/** Why a standing schedule cannot be saved (`standingScheduleProblem`). */
export type StandingScheduleProblem =
  | "off-step"
  | "empty"
  | "crosses-day-boundary";

/** What tells whether a task's standing schedule brings it in on a day. */
export interface StandingScheduleCandidate {
  readonly task: Pick<
    Task,
    "status" | "start" | "due" | "recurrence" | "standingSchedule"
  >;
  /** Its My Day entries, every logical day's. */
  readonly entries: MyDayEntries;
  /** Its last completion and last skip (GLOSSARY: 完成历史), if any. */
  readonly lastCompletion?: { readonly day: CalendarDate };
  readonly lastSkip?: { readonly day: CalendarDate };
}

/**
 * The standing schedule that brings the task into My Day on `day` (GLOSSARY:
 * 常设排期), or `undefined` when it does not bring it in: a recurring task,
 * its rule not paused, not left done without advancing (GLOSSARY: 未自动重
 * 复), with no My Day entry that day (an entry is what holds then), not
 * removed from My Day that day (`removedOn`), and either to be done by that
 * day (not done, its date, the due date if it has one, else the start date,
 * on that day or before) or completed or skipped that day, so it stays in
 * that day's My Day as done or skipped.
 */
export function bringingIn(
  candidate: StandingScheduleCandidate,
  day: CalendarDate,
): StandingSchedule | undefined {
  const { task } = candidate;
  if (task.standingSchedule.kind !== "schedule") return undefined;
  if (!activeRule(task.recurrence) || isNotAdvanced(task)) return undefined;
  if (entryOn(candidate.entries, day)) return undefined;
  const { removedOn } = task.standingSchedule.schedule;
  if (removedOn && compareDays(removedOn, day) === 0) return undefined;
  const date = task.due ?? task.start;
  const toDo = date !== null && compareDays(date, day) <= 0;
  const on = (entry: { readonly day: CalendarDate } | undefined) =>
    entry !== undefined && compareDays(entry.day, day) === 0;
  const overThatDay = on(candidate.lastCompletion) || on(candidate.lastSkip);
  return toDo || overThatDay ? task.standingSchedule.schedule : undefined;
}
