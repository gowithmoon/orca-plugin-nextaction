// Use case: edit a task's properties from the task panel (GLOSSARY: 任务属性面板).
// The status is not edited here: it goes through change status, which also
// records completions.
import type { TaskId } from "../../domain/task/task";
import type { TaskChanges } from "../../domain/task/task-changes";
import type { TaskRepository } from "../ports/task-repository";

/** The properties the task panel edits: every one but the status. */
export type TaskEdits = Omit<TaskChanges, "status">;

/**
 * Writes the properties present in `edits` to task `id`, overwriting them, in
 * one undo; the others are left as they are. Errors are thrown as they are,
 * for `ui` to report.
 */
export type EditTask = (id: TaskId, edits: TaskEdits) => Promise<void>;

export function createEditTask(deps: { repository: TaskRepository }): EditTask {
  return (id, edits) => deps.repository.updateTask(id, edits);
}
