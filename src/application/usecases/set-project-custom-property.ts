// Use case: set one custom property of a project from the project panel
// (GLOSSARY: 自定义属性, #235), as `set-custom-property` does for a task. The
// value is checked against the project tag's definitions by the repository
// as it writes (ADR 0023).
import type { ProjectId } from "../../domain/project/project";
import type { CustomPropertyValue } from "../../domain/task/custom-property";
import type { Clock } from "../ports/clock";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Writes `value` to the custom property `name` of project `id`, in one
 * undo; an empty value clears it. Fails with `CustomPropertyChangedError`,
 * writing nothing, when `name` is no longer defined on the project tag or
 * its kind is not the value's. Errors are thrown as they are, for `ui` to
 * report.
 */
export type SetProjectCustomProperty = (
  id: ProjectId,
  name: string,
  value: CustomPropertyValue,
) => Promise<void>;

export function createSetProjectCustomProperty(deps: {
  repository: TaskRepository;
  clock: Clock;
}): SetProjectCustomProperty {
  return (id, name, value) =>
    deps.repository.writeProjectCustomProperty(
      id,
      name,
      value,
      deps.clock.now(),
    );
}
