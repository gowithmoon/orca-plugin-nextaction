// Use case: read what the project panel shows of a project (GLOSSARY: 项目属
// 性面板, #232): its built-in properties. Shaped like the task panel's read
// (`ReadTaskForPanel`), so its custom properties join it later (#235).
import type { Project, ProjectId } from "../../domain/project/project";
import type { TaskRepository } from "../ports/task-repository";

/** What the project panel shows of a project. */
export interface ProjectForPanel {
  readonly project: Project;
}

/**
 * The project `id` as the project panel shows it, or `null` when the block
 * is not a project or the project tag is paused. Errors are thrown as they
 * are.
 */
export type ReadProjectForPanel = (
  id: ProjectId,
) => Promise<ProjectForPanel | null>;

export function createReadProjectForPanel(deps: {
  repository: TaskRepository;
}): ReadProjectForPanel {
  return async (id) => {
    const project = await deps.repository.getProject(id);
    return project ? { project } : null;
  };
}
