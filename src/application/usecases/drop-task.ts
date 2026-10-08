// Use case: drop a task (GLOSSARY: 放弃).
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Removes the task tag of task `id` and discards what the plugin recorded for
 * it, in one undo; subtasks are left as they are. Errors are thrown as they
 * are, for `ui` to report.
 */
export type DropTask = (id: TaskId) => Promise<void>;

export function createDropTask(deps: { repository: TaskRepository }): DropTask {
  return (id) => deps.repository.dropTask(id);
}
