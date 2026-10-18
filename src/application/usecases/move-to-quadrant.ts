// Use case: move a task to another quadrant of the My Day view's quadrant
// layout (GLOSSARY: 四象限, #199), by dragging its card there: the value that
// crosses the threshold is rewritten, by the domain's rule.
import { type Quadrant, quadrantChanges } from "../../domain/task/quadrant";
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Reads task `id`'s own importance and urgency and writes what moving it to
 * `target` changes (`quadrantChanges`), in one undo. Writes nothing when
 * nothing changes: the task is already in `target`, or is gone. Errors are
 * thrown as they are, for `ui` to report.
 */
export type MoveToQuadrant = (id: TaskId, target: Quadrant) => Promise<void>;

export function createMoveToQuadrant(deps: {
  repository: TaskRepository;
}): MoveToQuadrant {
  return async (id, target) => {
    const task = await deps.repository.getTask(id);
    if (!task) return;
    const changes = quadrantChanges(task, target);
    if (changes.importance === undefined && changes.urgency === undefined) {
      return;
    }
    await deps.repository.updateTask(id, { changes });
  };
}
