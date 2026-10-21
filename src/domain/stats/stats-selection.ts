// The stats view's selection (GLOSSARY: 统计视图, #137): one cell of the
// period, picked on the completion chart, or one item of a distribution,
// and the completions and skips it holds, the latest first. Pure.
import type { CompletionKind } from "../task/completion-history";
import type { CalendarDate, Task } from "../task/task";
import type { CountedEntry } from "./counted-completions";
import type { DistributionPick } from "./distributions";
import { inCell, type StatsCell } from "./stats-period";

/**
 * What can be selected: a cell, by its first and last logical days; or an
 * item of a distribution, its value `null` for "not set".
 */
export type StatsSelection =
  | {
      readonly kind: "cell";
      readonly first: CalendarDate;
      readonly last: CalendarDate;
    }
  | ({ readonly kind: "distribution" } & DistributionPick);

/** One completion or skip in the selection, with its task. */
export interface SelectedEntry<T> {
  readonly task: T;
  readonly kind: CompletionKind;
  readonly at: Date;
}

type PickedTask = Pick<Task, "contexts" | "tags" | "importance">;

/** A task with what it counts for. */
export interface SelectableTask<T extends PickedTask> {
  readonly task: T;
  readonly entries: readonly CountedEntry[];
}

/**
 * Whether `task` belongs to the distribution's item `pick`, as the
 * distributions sort it (distributions.ts): by its values now, "not set"
 * when it has none, its own importance (not the one its score inherits).
 */
function belongs(task: PickedTask, pick: DistributionPick): boolean {
  switch (pick.dimension) {
    case "importance":
      return task.importance === pick.value;
    case "context":
    case "tag": {
      const values = pick.dimension === "context" ? task.contexts : task.tags;
      return pick.value === null
        ? values.length === 0
        : values.includes(pick.value);
    }
  }
}

/**
 * The completions and skips `selection` holds in `period`, the latest
 * first: a cell's completions and skips; a distribution item's completions
 * only, as the distributions leave the skips out.
 */
export function selectedEntries<T extends PickedTask>(
  tasks: readonly SelectableTask<T>[],
  selection: StatsSelection,
  period: StatsCell,
): readonly SelectedEntry<T>[] {
  const held = (task: T, entry: CountedEntry): boolean => {
    if (selection.kind === "cell") return inCell(selection, entry.day);
    return (
      entry.kind === "completion" &&
      inCell(period, entry.day) &&
      belongs(task, selection)
    );
  };
  return tasks
    .flatMap(({ task, entries }) =>
      entries
        .filter((entry) => held(task, entry))
        .map((entry) => ({ task, kind: entry.kind, at: entry.at })),
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}
