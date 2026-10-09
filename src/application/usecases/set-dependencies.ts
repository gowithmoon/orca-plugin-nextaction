// Use case: set a task's dependencies from the task panel (#57, GLOSSARY:
// 依赖). Refusing a list that would make a dependency cycle comes with cycle
// detection (#60).
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Replaces the dependencies of task `id` with `targets`, in one undo; the
 * other properties are left as they are. Errors are thrown as they are, for
 * `ui` to report.
 */
export type SetDependencies = (
  id: TaskId,
  targets: readonly TaskId[],
) => Promise<void>;

export function createSetDependencies(deps: {
  repository: TaskRepository;
}): SetDependencies {
  return async (id, targets) => {
    // A target that is no longer a task is a stale dependency: editing the
    // dependencies clears the task's own (ADR 0016), in the same write.
    const tasks = new Set(
      (await deps.repository.queryTasks({})).map((task) => task.id),
    );
    await deps.repository.updateTask(id, {
      dependencies: targets.filter((target) => tasks.has(target)),
    });
  };
}
