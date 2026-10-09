// Use case: switch a task's sequential setting on or off from the task panel
// (GLOSSARY: 顺序执行). Refusing a switch that would make a cycle comes with
// cycle detection (#60).
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Writes sequential on or off for task `id`, in one undo; the other
 * properties are left as they are. Errors are thrown as they are, for `ui` to
 * report.
 */
export type SetSequential = (id: TaskId, sequential: boolean) => Promise<void>;

export function createSetSequential(deps: {
  repository: TaskRepository;
}): SetSequential {
  return (id, sequential) => deps.repository.updateTask(id, { sequential });
}
