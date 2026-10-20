// Use case: which tasks cannot depend on a given task, and why (#219, the
// task map's dependency drag). The reverse of the dependency candidates:
// those fix the dependent and list targets; this fixes the task depended on
// and lists dependents, by the same rules (ADR 0015), so a drop the map
// refuses is one the task panel would refuse too.
import {
  type DependencyCycleReason,
  dependentsThatCycle,
} from "../../domain/blocking/dependency-cycles";
import { buildTaskRelations } from "../../domain/blocking/task-relations";
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Why a task cannot depend on the task dragged from:
 * - `self`: it is that task;
 * - `already`: it depends on it already;
 * - `below`, `waits`: depending on it would make a dependency cycle, as the
 *   dependency candidates say (`DependencyCycleReason`): the task dragged
 *   from is below it, or already waits for it or something below it.
 */
export type DependentRefusal = "self" | "already" | DependencyCycleReason;

/**
 * The tasks that cannot depend on task `id`, each with why; a task not in
 * the map can. From one read. Errors are thrown as they are.
 */
export type ReadDependentRefusals = (
  id: TaskId,
) => Promise<ReadonlyMap<TaskId, DependentRefusal>>;

export function createReadDependentRefusals(deps: {
  repository: TaskRepository;
}): ReadDependentRefusals {
  return async (id) => {
    const snapshot = await deps.repository.readTaskGraph();
    const relations = buildTaskRelations(snapshot.tasks);
    const refusals = new Map<TaskId, DependentRefusal>(
      dependentsThatCycle(snapshot, id),
    );
    refusals.set(id, "self");
    for (const relation of relations.waitersOf(id)) {
      if (relation.kind === "dependency") {
        refusals.set(relation.waiting, "already");
      }
    }
    return refusals;
  };
}
