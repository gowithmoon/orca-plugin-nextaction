// Use case: whether a task is in today's My Day (GLOSSARY: 我的一天), e.g. for
// the task menu to offer adding or removing it.
import { entryOn } from "../../domain/task/my-day";
import type { TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import { standingBringingIn } from "./entries-with-standing-schedule";

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
 * Whether task `id` has an entry on the current logical day, or its standing
 * schedule brings it in (GLOSSARY: 常设排期; ADR 0029). A block that is not
 * a task is not in it. Errors are thrown as they are, for `ui` to report.
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
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    if (entryOn(read.entries, today)) return { kind: "in-today" };
    const task = await deps.repository.getTask(id);
    const standing =
      task &&
      (await standingBringingIn(deps.repository, task, read.entries, today));
    return { kind: standing ? "in-today" : "not-in-today" };
  };
}
