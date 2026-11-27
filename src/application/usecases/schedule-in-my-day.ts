// Use case: schedule a task in today's My Day (GLOSSARY: 排期), from the
// schedule popup (#84) or a drop on the timeline (#85). The start date, the
// due date and the score are left alone. A card its standing schedule
// brought in (GLOSSARY: 常设排期) gets today's entry, which holds from then
// on (ADR 0029).
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
import { entriesWithStandingSchedule } from "./entries-with-standing-schedule";
import { MyDayUnreadableError } from "./my-day-unreadable-error";

/**
 * Schedules task `id` on the current logical day at `request`, snapped by
 * the domain (`normalizeSchedule`), in one undo; past entries are kept
 * (ADR 0020). A task its standing schedule brings in, with no entry today,
 * gets one at `request` (ADR 0029). Unchanged when the task is not in
 * today's My Day or already has that schedule, from its entry or its
 * standing schedule. Throws `MyDayUnreadableError`, writing nothing, when
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
      throw new MyDayUnreadableError(id, read.reason);
    }
    const boundary = deps.dayBoundary.current();
    const today = logicalDay(deps.clock.now(), boundary);
    const range = logicalDayRange(today, boundary);
    const schedule = normalizeSchedule(request, range);
    const current = await entriesWithStandingSchedule(
      deps.repository,
      id,
      read.entries,
      today,
      range,
    );
    const entries = scheduleToday(current, today, schedule);
    if (entries === current) return { kind: "unchanged" };
    await deps.repository.updateTask(id, { myDay: entries });
    return { kind: "changed" };
  };
}
