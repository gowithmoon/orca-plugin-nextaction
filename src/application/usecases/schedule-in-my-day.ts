// Use case: schedule a task in today's My Day (GLOSSARY: 排期), from the
// schedule popup (#84) or a drop on the timeline (#85). The start date, the
// due date and the score are left alone.
import {
  normalizeSchedule,
  type ScheduleRequest,
  scheduleToday,
} from "../../domain/task/my-day";
import type { TaskId } from "../../domain/task/task";
import { logicalDay, logicalDayRange } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import type { MyDayChangeResult } from "./add-to-my-day";
import { MyDayUnreadableError } from "./my-day-unreadable-error";

/**
 * Schedules task `id` on the current logical day at `request`, snapped by
 * the domain (`normalizeSchedule`), in one undo; past entries are kept
 * (ADR 0020). Unchanged when the task is not in today's My Day or already
 * has that schedule. Throws `MyDayUnreadableError`, writing nothing, when
 * its entries cannot be read; other errors are thrown as they are, for `ui`
 * to report.
 */
export type ScheduleInMyDay = (
  id: TaskId,
  request: ScheduleRequest,
) => Promise<MyDayChangeResult>;

export function createScheduleInMyDay(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): ScheduleInMyDay {
  return async (id, request) => {
    const read = await deps.repository.readMyDay(id);
    if (read.kind === "unreadable") {
      throw new MyDayUnreadableError(
        `the My Day entries of task ${id} cannot be read (${read.reason})`,
      );
    }
    const boundary = deps.dayBoundary.current();
    const today = logicalDay(deps.clock.now(), boundary);
    const schedule = normalizeSchedule(
      request,
      logicalDayRange(today, boundary),
    );
    const entries = scheduleToday(read.entries, today, schedule);
    if (entries === read.entries) return { kind: "unchanged" };
    await deps.repository.writeMyDay(id, entries);
    return { kind: "changed" };
  };
}
