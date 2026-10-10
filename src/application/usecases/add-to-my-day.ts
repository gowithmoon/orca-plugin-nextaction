// Use case: add a task to today's My Day (GLOSSARY: 我的一天), unscheduled.
// Any task can be added, done ones and ones that are not next actions too.
import { addToday } from "../../domain/task/my-day";
import type { TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import { MyDayUnreadableError } from "./my-day-unreadable-error";

/** What changing a task's My Day did. */
export type MyDayChangeResult =
  | { kind: "changed" }
  /** It already stood so; nothing was written. */
  | { kind: "unchanged" };

/**
 * Adds task `id` to My Day on the current logical day in one undo, its past
 * entries kept (ADR 0020). Throws `MyDayUnreadableError`, writing nothing,
 * when its entries cannot be read; other errors are thrown as they are, for
 * `ui` to report.
 */
export type AddToMyDay = (id: TaskId) => Promise<MyDayChangeResult>;

export function createAddToMyDay(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): AddToMyDay {
  return async (id) => {
    const read = await deps.repository.readMyDay(id);
    if (read.kind === "unreadable") {
      throw new MyDayUnreadableError(
        `the My Day entries of task ${id} cannot be read (${read.reason})`,
      );
    }
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const entries = addToday(read.entries, today);
    if (entries === read.entries) return { kind: "unchanged" };
    await deps.repository.writeMyDay(id, entries);
    return { kind: "changed" };
  };
}
