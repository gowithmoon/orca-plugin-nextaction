// Matching a task against the contexts, labels and importance chosen in a
// view's filter (#55), shared by the next action view and the all tasks view
// (#69) so the two never drift apart. Pure.
import type { Importance, Task } from "./task";

/**
 * What one multi-value dimension (contexts, labels) lets through: a task
 * holding any of `values`, or, with `none`, a task holding no value at all.
 */
export interface ValuesChoice {
  readonly values: readonly string[];
  readonly none: boolean;
}

/**
 * Contexts, labels and importance as chosen. Within a dimension any choice is
 * enough ("or"); every dimension given must let the task through ("and").
 */
export interface TaskFilter {
  readonly contexts?: ValuesChoice;
  readonly labels?: ValuesChoice;
  /** The importance levels let through. */
  readonly importance?: readonly Importance[];
}

function choiceLets(
  choice: ValuesChoice | undefined,
  held: readonly string[],
): boolean {
  // Nothing chosen: the dimension does not filter.
  if (!choice || (choice.values.length === 0 && !choice.none)) return true;
  if (choice.none && held.length === 0) return true;
  return choice.values.some((value) => held.includes(value));
}

export function filterLets(filter: TaskFilter, task: Task): boolean {
  return (
    choiceLets(filter.contexts, task.contexts) &&
    choiceLets(filter.labels, task.labels) &&
    (!filter.importance ||
      filter.importance.length === 0 ||
      filter.importance.includes(task.importance))
  );
}
