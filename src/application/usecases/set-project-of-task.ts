// Use case: set, change or clear a task's own 所属项目 setting from the task
// panel (#146, GLOSSARY: 所属项目). One value at most (ADR 0025).
import type { ProjectId } from "../../domain/project/project";
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Writes `project` as task `id`'s own 所属项目 setting, `null` clearing it,
 * in one undo; the other properties are left as they are. Whatever the
 * notes held is replaced, so a stale setting goes with the edit (ADR 0016).
 * A block that is no longer a project, or the task itself, is not written:
 * the setting is cleared instead. Errors are thrown as they are.
 */
export type SetProjectOfTask = (
  id: TaskId,
  project: ProjectId | null,
) => Promise<void>;

export function createSetProjectOfTask(deps: {
  repository: TaskRepository;
}): SetProjectOfTask {
  return async (id, project) => {
    const snapshot = await deps.repository.readTaskGraph();
    const isProject =
      project !== null &&
      project !== id &&
      (snapshot.projects ?? []).some((item) => item.project.id === project);
    await deps.repository.updateTask(id, {
      changes: { project: isProject ? project : null },
    });
  };
}
