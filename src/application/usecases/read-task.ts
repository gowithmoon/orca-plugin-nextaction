// Use case: read a task, e.g. its current status when the task menu opens,
// or everything the task panel shows, its custom properties included.
import {
  type CustomPropertyDefinition,
  type CustomPropertyValue,
  emptyCustomPropertyValue,
} from "../../domain/task/custom-property";
import type { Task, TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/** The task `id`, or `null` when the block is not a task. Errors are thrown as they are. */
export type ReadTask = (id: TaskId) => Promise<Task | null>;

export function createReadTask(deps: { repository: TaskRepository }): ReadTask {
  return (id) => deps.repository.getTask(id);
}

/** A custom property of the task, as the task panel shows it. */
export interface TaskCustomProperty {
  readonly definition: CustomPropertyDefinition;
  /** This task's value, empty when it holds none. */
  readonly value: CustomPropertyValue;
}

/** What the task panel shows of a task. */
export interface TaskForPanel {
  readonly task: Task;
  /**
   * Every custom property the task tag defines (GLOSSARY: 自定义属性), in
   * Orca's order, each with this task's value.
   */
  readonly customProperties: readonly TaskCustomProperty[];
}

/**
 * The task `id` with its custom properties, or `null` when the block is not
 * a task. Errors are thrown as they are.
 */
export type ReadTaskForPanel = (id: TaskId) => Promise<TaskForPanel | null>;

export function createReadTaskForPanel(deps: {
  repository: TaskRepository;
}): ReadTaskForPanel {
  return async (id) => {
    const [task, definitions] = await Promise.all([
      deps.repository.getTask(id),
      deps.repository.readCustomPropertyDefinitions(),
    ]);
    if (!task) return null;
    return {
      task,
      customProperties: definitions.map((definition) => {
        const stored = task.customProperties[definition.name];
        return {
          definition,
          value:
            stored?.kind === definition.kind
              ? stored
              : emptyCustomPropertyValue(definition.kind),
        };
      }),
    };
  };
}
