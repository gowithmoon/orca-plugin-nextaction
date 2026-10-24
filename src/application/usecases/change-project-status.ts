// Use case: change a project's project status from the project menu
// (GLOSSARY: 项目状态, 项目操作菜单; #144). Only the project status is
// written: entering done leaves the tasks belonging to it as they are.
import type { ProjectId, ProjectStatus } from "../../domain/project/project";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Sets the project status of project `id` to `status` in one undo. Throws
 * `NotAProjectError` when the block is not a project; other errors are
 * thrown as they are, for `ui` to report.
 */
export type ChangeProjectStatus = (
  id: ProjectId,
  status: ProjectStatus,
) => Promise<void>;

export function createChangeProjectStatus(deps: {
  repository: TaskRepository;
}): ChangeProjectStatus {
  return async (id, status) => {
    // Written even when it already holds `status`: an empty or unknown
    // project status reads as planning, and choosing planning repairs it.
    await deps.repository.updateProjectStatus(id, status);
  };
}
