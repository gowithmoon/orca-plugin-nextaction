// Use case: change a task's status from the task menu (GLOSSARY: 状态).
import type { TaskId, TaskStatus } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/** What changing the status did. */
export type ChangeStatusResult =
  | { kind: "changed" }
  /** The task already was in that status; nothing was written. */
  | { kind: "unchanged" };

/**
 * Sets the status of task `id` to `status` in one undo. Errors are thrown as
 * they are, for `ui` to report.
 */
export type ChangeStatus = (
  id: TaskId,
  status: TaskStatus,
) => Promise<ChangeStatusResult>;

export function createChangeStatus(deps: {
  repository: TaskRepository;
}): ChangeStatus {
  return async (id, status) => {
    // An empty or unknown status already reads as inbox (taskFromNotes), so
    // choosing inbox for such a task writes nothing, as the icon says.
    const task = await deps.repository.getTask(id);
    if (task?.status === status) return { kind: "unchanged" };
    // A block that is no longer a task fails here, writing nothing.
    await deps.repository.updateTask(id, { status });
    return { kind: "changed" };
  };
}
