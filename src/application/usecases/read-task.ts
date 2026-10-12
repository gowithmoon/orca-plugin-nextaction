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

/** A target of a block reference custom property, as the task panel shows it. */
export interface BlockRefTarget {
  readonly id: number;
  /** Its text; `null` when deleted. */
  readonly text: string | null;
  /**
   * The block is gone or was deleted (#115): shown so and removable, never
   * cleared on its own.
   */
  readonly deleted: boolean;
}

/** A custom property of the task, as the task panel shows it. */
export interface TaskCustomProperty {
  readonly definition: CustomPropertyDefinition;
  /** This task's value, empty when it holds none. */
  readonly value: CustomPropertyValue;
  /** For a block reference property, its targets in the value's order. */
  readonly targets?: readonly BlockRefTarget[];
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
    const values = definitions.map((definition) => {
      const stored = task.customProperties[definition.name];
      return {
        definition,
        value:
          stored?.kind === definition.kind
            ? stored
            : emptyCustomPropertyValue(definition.kind),
      };
    });
    // The targets' texts are read only when there are any, in one read.
    const targetIds = [
      ...new Set(
        values.flatMap(({ value }) =>
          value.kind === "blockRefs" ? value.value : [],
        ),
      ),
    ];
    const texts =
      targetIds.length > 0
        ? await deps.repository.readBlockTexts(targetIds)
        : new Map<number, string>();
    return {
      task,
      customProperties: values.map((property) =>
        property.value.kind === "blockRefs"
          ? {
              ...property,
              targets: property.value.value.map((id) => {
                const text = texts.get(id);
                return text === undefined
                  ? { id, text: null, deleted: true }
                  : { id, text, deleted: false };
              }),
            }
          : property,
      ),
    };
  };
}
