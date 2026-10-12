// Use case: set one custom property of a task from the task panel (GLOSSARY:
// 自定义属性, #113). The definitions belong to Orca (ADR 0023); the value is
// checked against the current ones, as the user may just have deleted or
// changed the property in Orca.
import {
  type CustomPropertyValue,
  checkCustomPropertyValue,
} from "../../domain/task/custom-property";
import type { TaskId } from "../../domain/task/task";
import type { Clock } from "../ports/clock";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Writes `value` to the custom property `name` of task `id`, in one undo;
 * an empty value clears it. Fails with `CustomPropertyChangedError`, writing
 * nothing, when `name` is no longer defined or its kind is not the value's.
 * Errors are thrown as they are, for `ui` to report.
 */
export type SetCustomProperty = (
  id: TaskId,
  name: string,
  value: CustomPropertyValue,
) => Promise<void>;

export function createSetCustomProperty(deps: {
  repository: TaskRepository;
  clock: Clock;
}): SetCustomProperty {
  return async (id, name, value) => {
    const definitions = await deps.repository.readCustomPropertyDefinitions();
    checkCustomPropertyValue(definitions, name, value);
    await deps.repository.writeCustomProperty(
      id,
      name,
      value,
      deps.clock.now(),
    );
  };
}
