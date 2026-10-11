// Use case: advance a recurring task not advanced (GLOSSARY: 未自动重复,
// 安排下一次), from the task panel's notice (#93). The task was marked done in
// Orca's own interface, so the plugin never advanced it.
import { isNotAdvanced, planRepair } from "../../domain/recurrence/recurrence";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import { advanceWrites, eventNow } from "./advance-writes";

/**
 * What advancing did: the task's dates are on `next`; or, `next` being
 * `null`, this was its last occurrence (#89): the task stays done and its
 * rule is removed.
 */
export type RepairNotAdvancedResult =
  | {
      readonly next: CalendarDate;
      /** The logical day of the repair, for showing `next` beside it. */
      readonly repairedOn: CalendarDate;
    }
  | { readonly next: null };

/**
 * The task is not a task not advanced (not done, no rule, a paused rule, a
 * rule this plugin cannot read, or not a task at all), so there is nothing
 * to advance; the notes may have changed since the notice was shown.
 * Nothing was written.
 */
export class NothingToAdvanceError extends Error {
  override name = "NothingToAdvanceError";
}

/**
 * Advances task `id`, not advanced, in one undo: back to todo, its dates on
 * the next occurrence, and its done descendant tasks with it, as any advance
 * does. No completion is recorded. Errors are thrown as they are, for `ui`
 * to report.
 */
export type RepairNotAdvanced = (
  id: TaskId,
) => Promise<RepairNotAdvancedResult>;

export function createRepairNotAdvanced(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): RepairNotAdvanced {
  return async (id) => {
    const task = await deps.repository.getTask(id);
    if (!task || !isNotAdvanced(task)) {
      throw new NothingToAdvanceError(`task ${id} is not a task not advanced`);
    }
    const repair = eventNow(deps);
    const plan = planRepair(task.recurrence.rule, task, repair);
    await deps.repository.updateTasks(
      await advanceWrites(deps.repository, task, plan),
    );
    if (plan.next === null) return { next: null };
    return { next: plan.next, repairedOn: repair.day };
  };
}
