// Use case: change a task's status from the task menu (GLOSSARY: 状态), and
// record a completion when the task enters done (GLOSSARY: 完成历史).
import {
  historyAfterStatusChange,
  recordsCompletion,
} from "../../domain/task/completion-history";
import {
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
  | { kind: "unchanged" };

/**
 * The task's completion history holds something this plugin cannot read
 * (an unknown version, or damaged), so it cannot be set to done: the history
 * would be overwritten. Nothing was written.
 */
export class CompletionHistoryUnreadableError extends Error {
  override name = "CompletionHistoryUnreadableError";
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
    const read = await deps.repository.readCompletionHistory(id);
    if (read.kind === "unreadable") {
      throw new CompletionHistoryUnreadableError(
        `the completion history of task ${id} cannot be read (${read.reason})`,
      );
    }
    const now = deps.clock.now();
    const history = historyAfterStatusChange(
      read.history,
      task.status,
      status,
      {
        at: now,
        day: logicalDay(now, deps.dayBoundary.current()),
      },
    );
    await deps.repository.updateTask(id, { status }, history);
    return { kind: "changed" };
  };
}
