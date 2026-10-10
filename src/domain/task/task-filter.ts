// Matching a task against the contexts, labels, importance and urgency (#74)
// chosen in a view's filter (#55), shared by the next action view and the all tasks view
// (#69) so the two never drift apart. Pure.
import type { Importance, Rating, Task, Urgency } from "./task";

/**
 * What one multi-value dimension (contexts, labels) lets through: a task
 * holding any of `values`, or, with `none`, a task holding no value at all.
 */
export interface ValuesChoice {
  readonly values: readonly string[];
  readonly none: boolean;
}

/**
 * Contexts, labels, importance and urgency as chosen. Within a dimension any choice is
 * enough ("or"); every dimension given must let the task through ("and").
 */
export interface TaskFilter {
  readonly contexts?: ValuesChoice;
  readonly labels?: ValuesChoice;
  /** The importance levels let through. */
  readonly importance?: readonly Importance[];
  /** The urgency levels let through: the task's own, not inherited. */
  readonly urgency?: readonly Urgency[];
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

function levelLets(
  chosen: readonly Rating[] | undefined,
  level: Rating,
): boolean {
  // Nothing chosen: the dimension does not filter.
  return !chosen || chosen.length === 0 || chosen.includes(level);
}

function choosesAny(choice: ValuesChoice | undefined): boolean {
  return choice !== undefined && (choice.values.length > 0 || choice.none);
}

/** Something is chosen in some dimension: the filter lets fewer through. */
export function filterChoosesAny(filter: TaskFilter): boolean {
  return (
    choosesAny(filter.contexts) ||
    choosesAny(filter.labels) ||
    (filter.importance?.length ?? 0) > 0 ||
    (filter.urgency?.length ?? 0) > 0
  );
}

export function filterLets(filter: TaskFilter, task: Task): boolean {
  return (
    choiceLets(filter.contexts, task.contexts) &&
    choiceLets(filter.labels, task.labels) &&
    levelLets(filter.importance, task.importance) &&
    levelLets(filter.urgency, task.urgency)
  );
}
