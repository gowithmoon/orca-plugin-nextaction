// Use case: read a task, e.g. its current status when the task menu opens.
import type { Task, TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/** The task `id`, or `null` when the block is not a task. Errors are thrown as they are. */
export type ReadTask = (id: TaskId) => Promise<Task | null>;

export function createReadTask(deps: { repository: TaskRepository }): ReadTask {
  return (id) => deps.repository.getTask(id);
}
