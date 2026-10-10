// Use case: remove a task from today's My Day (GLOSSARY: 我的一天).
import { removeToday } from "../../domain/task/my-day";
import type { TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import type { MyDayChangeResult } from "./add-to-my-day";
import { MyDayUnreadableError } from "./my-day-unreadable-error";

/**
 * Removes task `id` from My Day on the current logical day in one undo:
 * only today's entry goes, past entries are kept (ADR 0020). Throws
 * `MyDayUnreadableError`, writing nothing, when its entries cannot be read;
 * other errors are thrown as they are, for `ui` to report.
 */
export type RemoveFromMyDay = (id: TaskId) => Promise<MyDayChangeResult>;

export function createRemoveFromMyDay(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): RemoveFromMyDay {
  return async (id) => {
    const read = await deps.repository.readMyDay(id);
    if (read.kind === "unreadable") {
      throw new MyDayUnreadableError(
        `the My Day entries of task ${id} cannot be read (${read.reason})`,
      );
    }
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const entries = removeToday(read.entries, today);
    if (entries === read.entries) return { kind: "unchanged" };
    await deps.repository.writeMyDay(id, entries);
    return { kind: "changed" };
  };
}
