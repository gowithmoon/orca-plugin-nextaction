// Use case: read the inbox (GLOSSARY: 收集箱), for the inbox view.
import type { Task, TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

export interface ReadInboxOptions {
  /**
   * A task kept in the list after it left the inbox (the one being edited,
   * #35 "离开收集箱"), in its place in capture order.
   */
  readonly keep?: TaskId;
}

/**
 * The tasks in the inbox, in the order they were captured: the earliest
 * created first, the lower ID first when created at the same moment. Errors
 * are thrown as they are.
 */
export type ReadInbox = (options?: ReadInboxOptions) => Promise<Task[]>;

function byCapture(a: Task, b: Task): number {
  return a.created.getTime() - b.created.getTime() || a.id - b.id;
}

export function createReadInbox(deps: {
  repository: TaskRepository;
}): ReadInbox {
  return async (options = {}) => {
    // No query condition matches a task whose status is empty or unknown,
    // though it reads as inbox, so every task is read and filtered here
    // (inbox-anomalous-status).
    const tasks = await deps.repository.queryTasks({});
    return tasks
      .filter((task) => task.status === "inbox" || task.id === options.keep)
      .sort(byCapture);
  };
}
