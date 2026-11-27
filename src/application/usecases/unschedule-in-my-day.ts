// Use case: unschedule a task in today's My Day (GLOSSARY: 未排期): it stays
// in My Day, back in the unscheduled area. From the schedule popup (#84) or
// a drop on the unscheduled area (#85). A card its standing schedule brought
// in (GLOSSARY: 常设排期) gets today's entry, unscheduled, which holds from
// then on (ADR 0029).
import { unscheduleToday } from "../../domain/task/my-day";
import type { TaskId } from "../../domain/task/task";
import { logicalDay, logicalDayRange } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import type { MyDayChangeResult } from "./add-to-my-day";
import { entriesWithStandingSchedule } from "./entries-with-standing-schedule";
import { MyDayUnreadableError } from "./my-day-unreadable-error";

/**
 * Unschedules task `id` on the current logical day in one undo, keeping its
 * entry and past entries (ADR 0020). A task its standing schedule brings
 * in, with no entry today, gets one, unscheduled (ADR 0029). Unchanged when
 * the task is not in today's My Day or is unscheduled already, its standing
 * schedule crossing the day boundary included. Throws `MyDayUnreadableError`,
 * writing nothing, when its entries cannot be read; other errors are thrown
 * as they are, for `ui` to report.
 */
export type UnscheduleInMyDay = (id: TaskId) => Promise<MyDayChangeResult>;

export function createUnscheduleInMyDay(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): UnscheduleInMyDay {
  return async (id) => {
    const read = await deps.repository.readMyDay(id);
    if (read.kind === "unreadable") {
      throw new MyDayUnreadableError(id, read.reason);
    }
    const boundary = deps.dayBoundary.current();
    const today = logicalDay(deps.clock.now(), boundary);
    const current = await entriesWithStandingSchedule(
      deps.repository,
      id,
      read.entries,
      today,
      logicalDayRange(today, boundary),
    );
    const entries = unscheduleToday(current, today);
    if (entries === current) return { kind: "unchanged" };
    await deps.repository.updateTask(id, { myDay: entries });
    return { kind: "changed" };
  };
}
