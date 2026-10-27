// Use case: quick capture in a project (GLOSSARY: 快速捕获; #239): from the
// window opened for a project, a new inbox task as the last child block of
// the project's block.

import type { ProjectId } from "../../domain/project/project";
import type { TaskId } from "../../domain/task/task";
import type {
  InitialProperties,
  TaskRepository,
} from "../ports/task-repository";

/**
 * What a quick capture in a project did. `empty`: the text was blank;
 * `projectGone`: the block is no longer a project. Nothing written for either.
 */
export type QuickCaptureInProjectResult =
  | { kind: "captured"; id: TaskId }
  | { kind: "empty" }
  | { kind: "projectGone" };

/** What the window sets on the new task: no 所属项目, the block decides it. */
export type ProjectTaskProperties = Omit<InitialProperties, "project">;

/**
 * Creates an inbox task from `text` (trimmed) as the last child block of
 * project `projectId`'s block, with the `initial` properties given, in one
 * undo; blank text writes nothing, properties or not. It belongs to the
 * project by where it is, with no 所属项目 setting of its own. A block that is
 * no longer a project (dropped, project tag removed, deleted, the project tag
 * paused) gets nothing: `projectGone`, for `ui` to say so; never the journal
 * instead. Errors are thrown as they are, for `ui` to report; a failed write
 * leaves no task.
 */
export type QuickCaptureInProject = (
  projectId: ProjectId,
  text: string,
  initial?: ProjectTaskProperties,
) => Promise<QuickCaptureInProjectResult>;

export function createQuickCaptureInProject(deps: {
  repository: TaskRepository;
}): QuickCaptureInProject {
  return async (projectId, text, initial) => {
    const trimmed = text.trim();
    if (trimmed === "") return { kind: "empty" };
    // Dropped, its project tag removed, or its block deleted while the window
    // was open; the project tag paused reads as no projects at all.
    const { projects = [] } = await deps.repository.readTaskGraph();
    if (!projects.some((item) => item.project.id === projectId)) {
      return { kind: "projectGone" };
    }
    const id = await deps.repository.appendTaskToProject(
      projectId,
      trimmed,
      initial,
    );
    return { kind: "captured", id };
  };
}
