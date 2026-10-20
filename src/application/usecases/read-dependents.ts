// Use case: the task panel's 后续任务 row (#208, GLOSSARY: 后续任务): the
// tasks that depend directly on a task.
import type { TaskId, TaskStatus } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/** A task that depends on the task, as the row shows it. */
export interface Dependent {
  readonly id: TaskId;
  /** As the notes hold it; may be empty. */
  readonly text: string;
  readonly status: TaskStatus;
}

/** Reads the dependents of task `id`. Errors are thrown as they are. */
export type ReadDependents = (id: TaskId) => Promise<Dependent[]>;

export function createReadDependents(deps: {
  repository: TaskRepository;
}): ReadDependents {
  return async (id) => {
    const snapshot = await deps.repository.readTaskGraph();
    // The graph holds source blocks only: an ID not among its tasks may be a
    // mirror's, read as its source's (ARCHITECTURE: mirrors resolve at the
    // repository). Most reads stop at the one graph read.
    const source = snapshot.tasks.some((item) => item.task.id === id)
      ? id
      : (await deps.repository.getTask(id))?.id;
    // A block that is not a task has none: a dependency on it is stale.
    if (source === undefined) return [];
    return (
      [...snapshot.tasks]
        .sort((a, b) => a.position - b.position)
        // Someday and waiting count: only done ones no longer wait for it.
        .filter(
          ({ task }) =>
            task.status !== "done" && task.dependencies.includes(source),
        )
        .map(({ task }) => ({
          id: task.id,
          text: task.text,
          status: task.status,
        }))
    );
  };
}
