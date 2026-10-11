// Use case: change a task's status from the task menu (GLOSSARY: 状态), and
// record a completion when the task enters done (GLOSSARY: 完成历史).

import { planDescendantResets } from "../../domain/recurrence/descendant-reset";
import { activeRule, planAdvance } from "../../domain/recurrence/recurrence";
import {
  historyAfterStatusChange,
  recordsCompletion,
} from "../../domain/task/completion-history";
import {
  type CalendarDate,
  hasStatusAnomaly,
  type TaskId,
  type TaskStatus,
} from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";

/** What changing the status did. */
export type ChangeStatusResult =
  | { kind: "changed" }
  /**
   * The task already was in that status, and the notes hold it; nothing was
   * written.
   */
  | { kind: "unchanged" }
  /**
   * A recurring task was completed and advanced (GLOSSARY: 安排下一次): a
   * completion recorded, back to todo, its dates on `next`. `completedOn` is
   * the logical day of the completion, for showing `next` beside it.
   */
  | { kind: "advanced"; next: CalendarDate; completedOn: CalendarDate }
  /**
   * A recurring task's last occurrence was completed (GLOSSARY: 重复规则): a
   * completion recorded, the task stays done and its rule is removed.
   */
  | { kind: "ended" };

/**
 * The task's completion history holds something this plugin cannot read
 * (an unknown version, or damaged), so it cannot be set to done: the history
 * would be overwritten. Nothing was written.
 */
export class CompletionHistoryUnreadableError extends Error {
  override name = "CompletionHistoryUnreadableError";
}

/**
 * The task's recurrence rule holds something this plugin cannot read (an
 * unknown version, a missing field, a value out of range), so it cannot be
 * set to done: whether and where it advances is unknown. Nothing was written.
 */
export class RecurrenceUnreadableError extends Error {
  override name = "RecurrenceUnreadableError";
  constructor(readonly reason: string) {
    super(`the recurrence rule cannot be read (${reason})`);
  }
}

/**
 * Sets the status of task `id` to `status` in one undo; entering done from
 * another status also records a completion, in the same undo. Errors are
 * thrown as they are, for `ui` to report.
 */
export type ChangeStatus = (
  id: TaskId,
  status: TaskStatus,
) => Promise<ChangeStatusResult>;

export function createChangeStatus(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): ChangeStatus {
  return async (id, status) => {
    // An empty or unknown status reads as inbox (taskFromNotes) but holds no
    // status: choosing inbox writes it, which repairs the task (#35 story 39).
    const task = await deps.repository.getTask(id);
    if (task?.status === status && !hasStatusAnomaly(task)) {
      return { kind: "unchanged" };
    }
    // A block that is no longer a task fails in updateTask, writing nothing.
    if (!task || !recordsCompletion(task.status, status)) {
      await deps.repository.updateTask(id, { status });
      return { kind: "changed" };
    }
    if (task.recurrence.kind === "unreadable") {
      throw new RecurrenceUnreadableError(task.recurrence.reason);
    }
    const read = await deps.repository.readCompletionHistory(id);
    if (read.kind === "unreadable") {
      throw new CompletionHistoryUnreadableError(
        `the completion history of task ${id} cannot be read (${read.reason})`,
      );
    }
    const now = deps.clock.now();
    const completion = {
      at: now,
      day: logicalDay(now, deps.dayBoundary.current()),
    };
    // A paused rule does not apply (GLOSSARY: 暂停重复, #92): the task is
    // completed like a plain task, its completion still recorded.
    const rule = activeRule(task.recurrence);
    if (rule) {
      // A recurring task advances (GLOSSARY: 安排下一次): status, dates,
      // history, the rule (one occurrence used up, #89) and its done
      // descendant tasks back to todo (#90), in one write, so one undo.
      const plan = planAdvance(rule, task, read.history, completion);
      if (plan.next === null) {
        // The last occurrence (#89): the task stays done and its rule is
        // removed; it does not advance, so its descendants are left as they
        // are.
        await deps.repository.updateTasks([
          {
            id,
            changes: plan.changes,
            completionHistory: plan.history,
            recurrence: null,
          },
        ]);
        return { kind: "ended" };
      }
      const graph = await deps.repository.readTaskGraph();
      const descendants = planDescendantResets(task, plan.next, graph.tasks);
      if (descendants.kind === "unreadable") {
        throw new RecurrenceUnreadableError(
          `descendant task ${descendants.id}: ${descendants.reason}`,
        );
      }
      await deps.repository.updateTasks([
        {
          id,
          changes: plan.changes,
          completionHistory: plan.history,
          ...(plan.recurrence !== undefined && {
            recurrence: plan.recurrence,
          }),
        },
        ...descendants.resets,
      ]);
      return {
        kind: "advanced",
        next: plan.next,
        completedOn: completion.day,
      };
    }
    const history = historyAfterStatusChange(
      read.history,
      task.status,
      status,
      completion,
    );
    await deps.repository.updateTask(id, { status }, history);
    return { kind: "changed" };
  };
}
