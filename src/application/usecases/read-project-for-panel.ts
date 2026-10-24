// Use case: read what the project panel shows of a project (GLOSSARY: 项目属
// 性面板, #232): its built-in properties, and the custom properties the
// project tag defines (GLOSSARY: 自定义属性, #235), shaped as the task panel's
// (`ReadTaskForPanel`).
import type { Project, ProjectId } from "../../domain/project/project";
import type { TaskRepository } from "../ports/task-repository";
import { customPropertiesForPanel, type TaskCustomProperty } from "./read-task";

/** What the project panel shows of a project. */
export interface ProjectForPanel {
  readonly project: Project;
  /**
   * Every custom property the project tag defines, in Orca's order, each
   * with this project's value; the task tag's are never among them.
   */
  readonly customProperties: readonly TaskCustomProperty[];
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
    // One read of the definitions for both the values and the rows.
    const read = await deps.repository.getProjectWithCustomProperties(id);
    if (!read) return null;
    return {
      project: read.project,
      customProperties: await customPropertiesForPanel(
        deps.repository,
        read.definitions,
        read.values,
      ),
    };
  };
}
