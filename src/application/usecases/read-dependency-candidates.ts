// Use case: the tasks the task panel offers to add as dependencies (#57,
// GLOSSARY: 依赖): every task not done, other than the task itself, with its
// text for searching, and whether depending on it would make a dependency
// cycle (#60), and whether it is a recurring task (#94, ADR 0021).
import {
  type DependencyCycleReason,
  dependencyTargetsThatCycle,
} from "../../domain/blocking/dependency-cycles";
import { recurs } from "../../domain/recurrence/recurrence";
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/** A task that can be picked as a dependency. */
export interface DependencyCandidate {
  readonly id: TaskId;
  /** As the notes hold it; may be empty. */
  readonly text: string;
  /**
   * Why depending on it would make a dependency cycle, so it cannot be
   * picked; `null` when it would not.
   */
  readonly cycle: DependencyCycleReason | null;
  /**
   * It is a recurring task (GLOSSARY: 重复任务): depending on it stays unmet
   * until it no longer recurs and is done at last (ADR 0021).
   */
  readonly recurring: boolean;
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
  return async (id) => {
    const snapshot = await deps.repository.readTaskGraph();
    const cycles = dependencyTargetsThatCycle(snapshot, id);
    return snapshot.tasks
      .map((item) => item.task)
      .filter((task) => task.id !== id && task.status !== "done")
      .map((task) => ({
        id: task.id,
        text: task.text,
        cycle: cycles.get(task.id) ?? null,
        recurring: recurs(task.recurrence),
      }));
  };
}
