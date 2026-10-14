// The distributions of the stats view (GLOSSARY: 统计视图, #136): a period's
// completions sorted by their task's contexts, labels and importance as they
// are now. Pure.
import type { Importance, Task } from "../task/task";
import type { CountedEntry } from "./counted-completions";

/** What a distribution sorts the completions by. */
export type DistributionDimension = "context" | "label" | "importance";

/**
 * One item of a distribution: a dimension and a value, which is what a
 * selection of the item holds (#137). For contexts and labels `null` is
 * "not set", one value like the others; importance is always set.
 */
export type DistributionPick =
  | {
      readonly dimension: "context" | "label";
      readonly value: string | null;
    }
  | { readonly dimension: "importance"; readonly value: Importance };

/** An item with the completions it counts. */
export type DistributionItem = DistributionPick & {
  readonly completions: number;
};

export interface Distributions {
  /** By context, the most first; "not set" last. */
  readonly context: readonly DistributionItem[];
  /** By label, the most first; "not set" last. */
  readonly label: readonly DistributionItem[];
  /** All seven importance levels, the lowest first. */
  readonly importance: readonly DistributionItem[];
}

/** A task with what it counts for in the period. */
export interface CountedTask {
  readonly task: Pick<Task, "contexts" | "labels" | "importance">;
  readonly entries: readonly CountedEntry[];
}

const importanceLevels: readonly Importance[] = [1, 2, 3, 4, 5, 6, 7];

/** A task's completions among its entries. */
function completionsOf(entries: readonly CountedEntry[]): number {
  return entries.filter((entry) => entry.kind === "completion").length;
}

/**
 * A distribution by values a task can have several of: each value counts
 * the task's completions once, the most first and the same number by name;
 * the tasks with none are "not set", last.
 */
function byValues(
  dimension: "context" | "label",
  tasks: readonly CountedTask[],
  values: (task: CountedTask["task"]) => readonly string[],
): DistributionItem[] {
  const counts = new Map<string, number>();
  let notSet = 0;
  for (const { task, entries } of tasks) {
    const completions = completionsOf(entries);
    if (completions === 0) continue;
    const own = values(task);
    if (own.length === 0) notSet += completions;
    for (const value of own) {
      counts.set(value, (counts.get(value) ?? 0) + completions);
    }
  }
  const items: DistributionItem[] = [...counts]
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
    .map(([value, completions]) => ({ dimension, value, completions }));
  if (notSet > 0) items.push({ dimension, value: null, completions: notSet });
  return items;
}

/**
 * The distributions of the completions in `tasks`' entries, which the
 * caller has kept to the period; skips are left out.
 */
export function distributions(tasks: readonly CountedTask[]): Distributions {
  return {
    context: byValues("context", tasks, (task) => task.contexts),
    label: byValues("label", tasks, (task) => task.labels),
    // The task's own importance, not the one its score inherits.
    importance: importanceLevels.map((value) => ({
      dimension: "importance",
      value,
      completions: tasks
        .filter(({ task }) => task.importance === value)
        .reduce((sum, { entries }) => sum + completionsOf(entries), 0),
    })),
  };
}
