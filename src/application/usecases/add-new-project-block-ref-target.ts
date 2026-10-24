// Use case: add a block that does not exist yet to a block reference custom
// property of a project from the project panel (GLOSSARY: 自定义属性, #235),
// as `add-new-block-ref-target` does for a task: a page named as typed.
import type { ProjectId } from "../../domain/project/project";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Adds a new page named `text` (surrounding spaces dropped) as the last
 * target of the block reference custom property `name` of project `id`, in
 * one undo; a page already named so is added instead. Does nothing for a
 * blank `text`. Fails with `CustomPropertyChangedError`, writing nothing,
 * when `name` is no longer a block reference property of the project tag.
 * Errors are thrown as they are, for `ui` to report.
 */
export type AddNewProjectBlockRefTarget = (
  id: ProjectId,
  name: string,
  text: string,
) => Promise<void>;

export function createAddNewProjectBlockRefTarget(deps: {
  repository: TaskRepository;
}): AddNewProjectBlockRefTarget {
  return async (id, name, text) => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    await deps.repository.addNewProjectBlockRefTarget(id, name, trimmed);
  };
}
