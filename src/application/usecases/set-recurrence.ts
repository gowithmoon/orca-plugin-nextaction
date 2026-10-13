// Use case: set, change or remove a task's recurrence rule from the
// recurrence rule popup (GLOSSARY: 重复规则). The task's dates are not
// touched: when this occurrence is done stays the user's choice. Resuming a
// paused rule of a done task (GLOSSARY: 暂停重复, #92) is the exception: it
// advances the task in the same undo.
import {
  isResume,
  planResume,
  type RecurrenceRule,
} from "../../domain/recurrence/recurrence";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import { advanceWrites, eventNow } from "./advance-writes";
import { CompletionHistoryUnreadableError } from "./completion-history-unreadable-error";

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
    // Anything but a resume only writes the rule (a block that is no longer
    // a task fails there, writing nothing).
    if (!task || !isResume(task, rule)) {
      await deps.repository.updateTask(id, { recurrence: rule });
      return { kind: "set" };
    }
    const read = await deps.repository.readCompletionHistory(id);
    if (read.kind === "unreadable") {
      throw new CompletionHistoryUnreadableError(id, read.reason);
    }
    const resume = eventNow(deps);
    const plan = planResume(rule, task, read.history, resume);
    // The rule (with one of the remaining occurrences used up when it counts
    // them, removed on the last occurrence, #89), the task's status and dates,
    // and its done descendant tasks (#90) in one write, so one undo.
    await deps.repository.updateTasks(
      await advanceWrites(deps.repository, task, {
        ...plan,
        // Absent when the rule is unchanged: the resumed rule is written.
        recurrence: plan.recurrence === undefined ? rule : plan.recurrence,
      }),
    );
    if (plan.next === null) return { kind: "ended" };
    return { kind: "advanced", next: plan.next, resumedOn: resume.day };
  };
}
