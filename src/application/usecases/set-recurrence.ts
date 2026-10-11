// Use case: set, change or remove a task's recurrence rule from the
// recurrence rule popup (GLOSSARY: 重复规则). The task's dates are not
// touched: when this occurrence is done stays the user's choice. Resuming a
// paused rule of a done task (GLOSSARY: 暂停重复, #92) is the exception: it
// advances the task in the same undo.
import { planDescendantResets } from "../../domain/recurrence/descendant-reset";
import {
  activeRule,
  planResume,
  type RecurrenceRule,
} from "../../domain/recurrence/recurrence";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import {
  CompletionHistoryUnreadableError,
  RecurrenceUnreadableError,
} from "./change-status";

/** What setting the rule did. */
export type SetRecurrenceResult =
  /** The rule was written; nothing else changed. */
  | { kind: "set" }
  /**
   * The rule of a done task was resumed and the task advanced (GLOSSARY:
   * 安排下一次): back to todo, its dates on `next`, nothing recorded.
   * `resumedOn` is the logical day of the resume, for showing `next` beside
   * it.
   */
  | { kind: "advanced"; next: CalendarDate; resumedOn: CalendarDate }
  /**
   * The rule of a done task was resumed on its last occurrence (#89): the
   * task stays done and the rule is removed.
   */
  | { kind: "ended" };

/**
 * Writes `rule` as task `id`'s recurrence rule in one undo; `null` removes
 * it. Errors are thrown as they are, for `ui` to report.
 */
export type SetRecurrence = (
  id: TaskId,
  rule: RecurrenceRule | null,
) => Promise<SetRecurrenceResult>;

export function createSetRecurrence(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): SetRecurrence {
  return async (id, rule) => {
    const task = await deps.repository.getTask(id);
    // Resuming (GLOSSARY: 暂停重复): a paused rule made to apply again on a
    // done task. Anything else only writes the rule (a block that is no
    // longer a task fails there, writing nothing).
    const resumed =
      task !== null &&
      task.status === "done" &&
      task.recurrence.kind === "rule" &&
      task.recurrence.rule.paused === true &&
      rule !== null &&
      activeRule({ kind: "rule", rule }) !== undefined;
    if (!task || !resumed) {
      await deps.repository.writeRecurrence(id, rule);
      return { kind: "set" };
    }
    const read = await deps.repository.readCompletionHistory(id);
    if (read.kind === "unreadable") {
      throw new CompletionHistoryUnreadableError(
        `the completion history of task ${id} cannot be read (${read.reason})`,
      );
    }
    const now = deps.clock.now();
    const resume = {
      at: now,
      day: logicalDay(now, deps.dayBoundary.current()),
    };
    const plan = planResume(rule, task, read.history, resume);
    if (plan.next === null) {
      // Its last occurrence (#89): it stays done, the rule removed, and its
      // descendants are left as they are.
      await deps.repository.updateTasks([
        { id, changes: plan.changes, recurrence: null },
      ]);
      return { kind: "ended" };
    }
    // Its done descendant tasks go back to todo, as on any advance (#90).
    const graph = await deps.repository.readTaskGraph();
    const descendants = planDescendantResets(task, plan.next, graph.tasks);
    if (descendants.kind === "unreadable") {
      throw new RecurrenceUnreadableError(
        `descendant task ${descendants.id}: ${descendants.reason}`,
      );
    }
    // The rule, the task's status and dates, and its descendant tasks in one
    // write, so one undo.
    await deps.repository.updateTasks([
      // With one of the remaining occurrences used up, when it counts them.
      { id, changes: plan.changes, recurrence: plan.recurrence ?? rule },
      ...descendants.resets,
    ]);
    return { kind: "advanced", next: plan.next, resumedOn: resume.day };
  };
}
