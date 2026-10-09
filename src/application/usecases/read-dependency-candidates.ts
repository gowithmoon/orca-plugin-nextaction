// Use case: the tasks the task panel offers to add as dependencies (#57,
// GLOSSARY: 依赖): every task not done, other than the task itself, with its
// text for searching. Marking the ones that would make a dependency cycle
// comes with cycle detection (#60).
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/** A task that can be picked as a dependency. */
export interface DependencyCandidate {
  readonly id: TaskId;
  /** As the notes hold it; may be empty. */
  readonly text: string;
}

/**
 * The dependency candidates for task `id`, in no particular order, from one
 * read. Errors are thrown as they are.
 */
export type ReadDependencyCandidates = (
  id: TaskId,
) => Promise<DependencyCandidate[]>;

export function createReadDependencyCandidates(deps: {
  repository: TaskRepository;
}): ReadDependencyCandidates {
  return async (id) =>
    (await deps.repository.queryTasks({}))
      .filter((task) => task.id !== id && task.status !== "done")
      .map((task) => ({ id: task.id, text: task.text }));
}
