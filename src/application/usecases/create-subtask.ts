// Use case: create a subtask from the task menu (#190): a new inbox task as
// the last child block of a task, from the "Create subtask" window.

import type { TaskId } from "../../domain/task/task";
import type {
  InitialProperties,
  TaskRepository,
} from "../ports/task-repository";
import {
  createReadProjectOfTask,
  type ProjectShown,
} from "./read-project-of-task";

/** What a subtask creation did. `empty`: the text was blank, nothing written. */
export type CreateSubtaskResult =
  | { kind: "created"; id: TaskId }
  | { kind: "empty" };

/** What the window sets on the new subtask: no 所属项目, the parent decides it. */
export type SubtaskProperties = Omit<InitialProperties, "project">;

/**
 * Creates an inbox task from `text` (trimmed) as the last subtask of task
 * `parentId`, with the `initial` properties given, in one undo; blank text
 * writes nothing, properties or not. It belongs to the parent's project,
 * as every subtask does (GLOSSARY: 所属项目). Errors are thrown as they are,
 * for `ui` to report; a failed write leaves no task.
 */
export type CreateSubtask = (
  parentId: TaskId,
  text: string,
  initial?: SubtaskProperties,
) => Promise<CreateSubtaskResult>;

export function createCreateSubtask(deps: {
  repository: TaskRepository;
}): CreateSubtask {
  return async (parentId, text, initial) => {
    const trimmed = text.trim();
    if (trimmed === "") return { kind: "empty" };
    const id = await deps.repository.appendSubtask(parentId, trimmed, initial);
    return { kind: "created", id };
  };
}

/**
 * The project a new subtask of task `parentId` will belong to, for the
 * window to show; `null` for none, or while the project tag is paused. The
 * parent task's project when it has one: its decision covers its subtasks.
 * Otherwise the parent itself when it is also a project block (ADR 0025): it
 * is the subtask's nearest project block. Errors are thrown as they are.
 */
export type ReadSubtaskProject = (
  parentId: TaskId,
) => Promise<ProjectShown | null>;

export function createReadSubtaskProject(deps: {
  repository: TaskRepository;
}): ReadSubtaskProject {
  const readProjectOfTask = createReadProjectOfTask(deps);
  return async (parentId) => {
    const read = await readProjectOfTask(parentId);
    if (read.project || read.projectsPaused) return read.project;
    const { projects = [] } = await deps.repository.readTaskGraph();
    const parent = projects.find((item) => item.project.id === parentId);
    return parent
      ? {
          id: parent.project.id,
          text: parent.project.text,
          status: parent.project.status,
        }
      : null;
  };
}
