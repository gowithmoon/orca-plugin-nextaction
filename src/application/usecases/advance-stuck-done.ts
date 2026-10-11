// Use case: advance a recurring task not advanced (GLOSSARY: 未自动重复, 安排下一次),
// from the task panel's notice (#93). The task was marked done in Orca's own
// interface, so the plugin never advanced it.
import { planDescendantResets } from "../../domain/recurrence/descendant-reset";
import { isStuckDone, planRepair } from "../../domain/recurrence/recurrence";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import { RecurrenceUnreadableError } from "./change-status";

/**
 * What advancing did: the task's dates are on `next`; or, `next` being
 * `null`, this was its last occurrence (#89): the task stays done and its
 * rule is removed.
 */
export type AdvanceStuckDoneResult =
  | {
      readonly next: CalendarDate;
      /** The logical day of the repair, for showing `next` beside it. */
      readonly repairedOn: CalendarDate;
    }
  | { readonly next: null };

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
    const write = {
      id,
      changes: plan.changes,
      ...(plan.recurrence !== undefined && { recurrence: plan.recurrence }),
    };
    if (plan.next === null) {
      await deps.repository.updateTasks([write]);
      return { next: null };
    }
    const graph = await deps.repository.readTaskGraph();
    const descendants = planDescendantResets(task, plan.next, graph.tasks);
    if (descendants.kind === "unreadable") {
      throw new RecurrenceUnreadableError(
        `descendant task ${descendants.id}: ${descendants.reason}`,
      );
    }
    await deps.repository.updateTasks([write, ...descendants.resets]);
    return { next: plan.next, repairedOn: repair.day };
  };
}
