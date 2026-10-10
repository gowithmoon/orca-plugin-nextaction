// Use case: unschedule a task in today's My Day (GLOSSARY: 未排期): it stays
// in My Day, back in the unscheduled area. From the schedule popup (#84) or
// a drop on the unscheduled area (#85).
import { unscheduleToday } from "../../domain/task/my-day";
import type { TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import type { MyDayChangeResult } from "./add-to-my-day";
import { MyDayUnreadableError } from "./my-day-unreadable-error";

/**
 * Unschedules task `id` on the current logical day in one undo, keeping its
 * entry and past entries (ADR 0020). Unchanged when the task is not in
 * today's My Day or is unscheduled already. Throws `MyDayUnreadableError`,
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
      throw new MyDayUnreadableError(
        `the My Day entries of task ${id} cannot be read (${read.reason})`,
      );
    }
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const entries = unscheduleToday(read.entries, today);
    if (entries === read.entries) return { kind: "unchanged" };
    await deps.repository.writeMyDay(id, entries);
    return { kind: "changed" };
  };
}
