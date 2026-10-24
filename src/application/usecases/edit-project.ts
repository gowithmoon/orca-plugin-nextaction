// Use case: edit a project's properties from the project panel (GLOSSARY:
// 项目属性面板, #232). The project status is not edited here: it goes through
// change project status, shared with the project menu.
import type { ProjectChanges, ProjectId } from "../../domain/project/project";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Writes the properties present in `changes` to project `id`, overwriting
 * them, in one undo; the others are left as they are. Throws
 * `NotAProjectError`, writing nothing, when the block is not a project;
 * other errors (the project tag paused included) are thrown as they are,
 * for `ui` to report.
 */
export type EditProject = (
  id: ProjectId,
  changes: ProjectChanges,
) => Promise<void>;

export function createEditProject(deps: {
  repository: TaskRepository;
}): EditProject {
  return (id, changes) => deps.repository.updateProject(id, changes);
}
