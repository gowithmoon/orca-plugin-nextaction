// Use case: set a task's dependencies from the task panel (#57, GLOSSARY:
// 依赖). A list that would make a dependency cycle is refused (#60).
import { targetsThatCycle } from "../../domain/blocking/dependency-cycles";
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";
import { DependencyCycleError } from "./dependency-cycle-error";

/**
 * Replaces the dependencies of task `id` with `targets`, in one undo; the
 * other properties are left as they are. Fails with `DependencyCycleError`,
 * writing nothing, when a target added would make a dependency cycle. Errors
 * are thrown as they are, for `ui` to report.
 */
export type SetDependencies = (
  id: TaskId,
  targets: readonly TaskId[],
) => Promise<void>;

export function createSetDependencies(deps: {
  repository: TaskRepository;
}): SetDependencies {
  return async (id, targets) => {
    const snapshot = await deps.repository.readTaskGraph();
    const tasks = new Map(snapshot.tasks.map((item) => [item.task.id, item]));
    // A target that is no longer a task is a stale dependency: editing the
    // dependencies clears the task's own (ADR 0016), in the same write.
    const kept = targets.filter((target) => tasks.has(target));
    const cycling = targetsThatCycle(snapshot, id, kept);
    if (cycling.length > 0) {
      throw new DependencyCycleError({
        kind: "dependencies",
        targets: cycling.map((target) => ({
          id: target,
          text: tasks.get(target)?.task.text ?? "",
        })),
      });
    }
    await deps.repository.updateTask(id, { dependencies: kept });
  };
}
