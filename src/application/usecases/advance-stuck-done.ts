// Use case: advance a recurring task stuck in done (GLOSSARY: 进入下一次),
// from the task panel's notice (#93). The task was marked done in Orca's own
// interface, so the plugin never advanced it.
import { isStuckDone, planRepair } from "../../domain/recurrence/recurrence";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";

/** What advancing did: the task's dates are on `next`. */
export interface AdvanceStuckDoneResult {
  readonly next: CalendarDate;
  /** The logical day of the repair, for showing `next` beside it. */
  readonly repairedOn: CalendarDate;
}

/**
 * The task is not stuck in done (not done, no rule, a rule this plugin
 * cannot read, or not a task at all), so there is nothing to advance; the
 * notes may have changed since the notice was shown. Nothing was written.
 */
export class NotStuckDoneError extends Error {
  override name = "NotStuckDoneError";
}

/**
 * Advances task `id`, stuck in done, in one undo: back to todo, its dates on
 * the next occurrence. No completion is recorded. Errors are thrown as they
 * are, for `ui` to report.
 */
export type AdvanceStuckDone = (id: TaskId) => Promise<AdvanceStuckDoneResult>;

export function createAdvanceStuckDone(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): AdvanceStuckDone {
  return async (id) => {
    const task = await deps.repository.getTask(id);
    if (!task || !isStuckDone(task) || task.recurrence.kind !== "rule") {
      throw new NotStuckDoneError(`task ${id} is not stuck in done`);
    }
    const now = deps.clock.now();
    const repair = {
      at: now,
      day: logicalDay(now, deps.dayBoundary.current()),
    };
    const plan = planRepair(task.recurrence.rule, task, repair);
    await deps.repository.updateTask(id, plan.changes);
    return { next: plan.next, repairedOn: repair.day };
  };
}
