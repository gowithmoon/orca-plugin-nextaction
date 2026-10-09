// Use case: choose how a task's dependencies are met from the task panel
// (GLOSSARY: 依赖模式, #58). Changing the mode never makes a cycle, so nothing
// is checked first.
import type { DependencyMode, TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Writes the dependency mode of task `id`, in one undo; the other
 * properties are left as they are. Errors are thrown as they are, for `ui` to
 * report.
 */
export type SetDependencyMode = (
  id: TaskId,
  mode: DependencyMode,
) => Promise<void>;

export function createSetDependencyMode(deps: {
  repository: TaskRepository;
}): SetDependencyMode {
  return (id, dependencyMode) =>
    deps.repository.updateTask(id, { dependencyMode });
}
