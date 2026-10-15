// Use case: read a project, e.g. its current project status when the project
// menu opens (#144).
import type { Project, ProjectId } from "../../domain/project/project";
import type { TaskRepository } from "../ports/task-repository";

/**
 * The project `id`, or `null` when the block is not a project or the project
 * tag is paused. Errors are thrown as they are.
 */
export type ReadProject = (id: ProjectId) => Promise<Project | null>;

export function createReadProject(deps: {
  repository: TaskRepository;
}): ReadProject {
  return (id) => deps.repository.getProject(id);
}
