// Use case: "Always schedule at this time" on a timeline card (GLOSSARY: 常设
// 排期, #247): a recurring task's standing schedule set to the times of day
// of today's schedule, so it sits there on every day it is to be done.
import {
  entryOn,
  type MyDayEntries,
  scheduleWithin,
} from "../../domain/task/my-day";
import {
  type StandingSchedule,
  standingScheduleProblem,
} from "../../domain/task/standing-schedule";
import type { TaskId } from "../../domain/task/task";
import { logicalDay, logicalDayRange } from "../../domain/time/logical-day";
import { sameTimeOfDay, timeOfDayOf } from "../../domain/time/time-of-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import { MyDayUnreadableError } from "./my-day-unreadable-error";
import {
  checkStandingSchedule,
  replacingStandingSchedule,
} from "./set-standing-schedule";

/**
 * The task has no schedule today to take the times from: no entry today, an
 * unscheduled one, or one outside today's range (ADR 0020). Nothing was
 * written.
 */
export class NotScheduledTodayError extends Error {
  override name = "NotScheduledTodayError";

  constructor(id: TaskId) {
    super(`task ${id} is not scheduled today`);
  }
}

/** What reading and setting from today's schedule needs. */
interface FromTodayDeps {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}

/**
 * The times of day of today's entry's schedule, or `undefined` when it has
 * none that holds today. Only an entry counts: a task its standing schedule
 * brings in sits at that standing schedule already.
 */
function todaysTimes(
  entries: MyDayEntries,
  deps: FromTodayDeps,
): StandingSchedule | undefined {
  const boundary = deps.dayBoundary.current();
  const today = logicalDay(deps.clock.now(), boundary);
  const schedule = entryOn(entries, today)?.schedule;
  if (!schedule || !scheduleWithin(schedule, logicalDayRange(today, boundary)))
    return undefined;
  return { start: timeOfDayOf(schedule.start), end: timeOfDayOf(schedule.end) };
}

/**
 * Sets task `id`'s standing schedule to the times of day of today's
 * schedule, in one undo, and returns it; My Day entries are left as they
 * are. Throws, writing nothing: `NotScheduledTodayError` without a schedule
 * today, `MyDayUnreadableError` when its entries cannot be read,
 * `StandingScheduleRefusedError` as `checkStandingSchedule` says (a task
 * without a recurrence rule). Other errors are thrown as they are, for `ui`
 * to report.
 */
export type SetStandingScheduleFromToday = (
  id: TaskId,
) => Promise<StandingSchedule>;

export function createSetStandingScheduleFromToday(
  deps: FromTodayDeps,
): SetStandingScheduleFromToday {
  return async (id) => {
    const read = await deps.repository.readMyDay(id);
    if (read.kind === "unreadable") {
      throw new MyDayUnreadableError(id, read.reason);
    }
    const schedule = todaysTimes(read.entries, deps);
    if (!schedule) throw new NotScheduledTodayError(id);
    const task = await deps.repository.getTask(id);
    checkStandingSchedule(task, schedule, deps.dayBoundary.current());
    await deps.repository.updateTask(id, {
      standingSchedule: replacingStandingSchedule(task, schedule),
    });
    return schedule;
  };
}

/** What the task menu offers: today's times as the standing schedule. */
export interface StandingScheduleOffer {
  readonly times: StandingSchedule;
  /** It has a standing schedule already, at other times. */
  readonly replacing: boolean;
}

/**
 * What setting the standing schedule from today would do for task `id`, or
 * `null` when it would do nothing or be refused: no recurrence rule, no
 * schedule today, its My Day entries or its standing schedule unreadable,
 * or its standing schedule at today's times already. Errors are thrown as
 * they are, for `ui` to report.
 */
export type ReadStandingScheduleOffer = (
  id: TaskId,
) => Promise<StandingScheduleOffer | null>;

export function createReadStandingScheduleOffer(
  deps: FromTodayDeps,
): ReadStandingScheduleOffer {
  return async (id) => {
    const read = await deps.repository.readMyDay(id);
    if (read.kind === "unreadable") return null;
    const times = todaysTimes(read.entries, deps);
    if (!times) return null;
    const task = await deps.repository.getTask(id);
    if (task?.recurrence.kind !== "rule") return null;
    if (standingScheduleProblem(times, deps.dayBoundary.current())) return null;
    const current = task.standingSchedule;
    if (current.kind === "unreadable") return null;
    if (current.kind === "schedule" && sameTimes(current.schedule, times)) {
      return null;
    }
    return { times, replacing: current.kind === "schedule" };
  };
}

const sameTimes = (a: StandingSchedule, b: StandingSchedule) =>
  sameTimeOfDay(a.start, b.start) && sameTimeOfDay(a.end, b.end);
