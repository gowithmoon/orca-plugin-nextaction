// Use case: add a block that does not exist yet to a block reference custom
// property of a task from the task panel (GLOSSARY: 自定义属性), e.g. a
// person not yet in the notes to delegate to. The new block is a page
// named as typed, as Orca's own property input makes one
// (custom-properties, "块引用新建目标"). Checked against the definitions by
// the repository as it writes, as `set-custom-property`.
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Adds a new page named `text` (surrounding spaces dropped) as the last
 * target of the block reference custom property `name` of task `id`, in one
 * undo; a page already named so is added instead. Does nothing for a blank
 * `text`. Fails with `CustomPropertyChangedError`, writing nothing, when
 * `name` is no longer a block reference property. Errors are thrown as they
 * are, for `ui` to report.
 */
export type AddNewBlockRefTarget = (
  id: TaskId,
  name: string,
  text: string,
) => Promise<void>;

export function createAddNewBlockRefTarget(deps: {
  repository: TaskRepository;
}): AddNewBlockRefTarget {
  return async (id, name, text) => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    await deps.repository.addNewBlockRefTarget(id, name, trimmed);
  };
}
