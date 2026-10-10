// Use case: whether a task is in today's My Day (GLOSSARY: 我的一天), e.g. for
// the task menu to offer adding or removing it.
import { todayEntry } from "../../domain/task/my-day";
import type { TaskId } from "../../domain/task/task";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";

/** Where a task stands in today's My Day. */
export type MyDayStatus =
  | { kind: "in-today" }
  | { kind: "not-in-today" }
  /**
   * Its My Day entries hold something this plugin cannot read (an unknown
   * version, or damaged); they cannot be changed.
   */
  | { kind: "unreadable"; reason: string };

/**
 * Whether task `id` has an entry on the current logical day. A block that is
 * not a task is not in it. Errors are thrown as they are, for `ui` to report.
 */
export type ReadMyDayStatus = (id: TaskId) => Promise<MyDayStatus>;

export function createReadMyDayStatus(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): ReadMyDayStatus {
  return async (id) => {
    const read = await deps.repository.readMyDay(id);
    if (read.kind === "unreadable") return read;
    const entry = todayEntry(
      read.entries,
      deps.clock.now(),
      deps.dayBoundary.current(),
    );
    return { kind: entry ? "in-today" : "not-in-today" };
  };
}
