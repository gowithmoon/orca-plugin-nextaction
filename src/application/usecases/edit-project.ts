// Use case: edit a project's properties from the project panel (GLOSSARY:
// 项目属性面板, #232). The project status is not edited here: it goes through
// change project status, shared with the project menu.
import type { ProjectChanges, ProjectId } from "../../domain/project/project";
import type { TaskRepository } from "../ports/task-repository";
import { NotAProjectError } from "./change-project-status";

/**
 * Writes the properties present in `changes` to project `id`, overwriting
 * them, in one undo; the others are left as they are. Throws
 * `NotAProjectError`, writing nothing, when the block is not a project (the
 * project tag paused included); other errors are thrown as they are, for
 * `ui` to report.
 */
export type EditProject = (
  id: ProjectId,
  changes: ProjectChanges,
) => Promise<void>;

export function createEditProject(deps: {
  repository: TaskRepository;
}): EditProject {
  return async (id, changes) => {
    const project = await deps.repository.getProject(id);
    if (!project) throw new NotAProjectError(id);
    await deps.repository.updateProject(id, changes);
  };
}
