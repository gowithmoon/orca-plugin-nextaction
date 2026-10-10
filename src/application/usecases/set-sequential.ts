// Use case: switch a task's sequential setting on or off from the task panel
// (GLOSSARY: 顺序执行). Switching it on is refused when it would make a
// dependency cycle (#60).
import { sequentialCycle } from "../../domain/blocking/dependency-cycles";
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";
import { DependencyCycleError } from "./dependency-cycle-error";

/**
 * Writes sequential on or off for task `id`, in one undo; the other
 * properties are left as they are. Switching on fails with
 * `DependencyCycleError`, writing nothing, when it would make a dependency
 * cycle; switching off is never refused. Errors are thrown as they are, for
 * `ui` to report.
 */
export type SetSequential = (id: TaskId, sequential: boolean) => Promise<void>;

export function createSetSequential(deps: {
  repository: TaskRepository;
}): SetSequential {
  return async (id, sequential) => {
    if (sequential) {
      const snapshot = await deps.repository.readTaskGraph();
      const cycle = sequentialCycle(snapshot, id);
      if (cycle) {
        const task = (taskId: TaskId) => ({
          id: taskId,
          text:
            snapshot.tasks.find((item) => item.task.id === taskId)?.task.text ??
            "",
        });
        throw new DependencyCycleError({
          kind: "sequential",
          waiting: task(cycle.waiting),
          waitingFor: task(cycle.waitingFor),
        });
      }
    }
    await deps.repository.updateTask(id, { sequential });
  };
}
