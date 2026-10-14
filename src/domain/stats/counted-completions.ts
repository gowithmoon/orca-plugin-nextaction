// What a task counts for in the stats (GLOSSARY: 统计视图): its completions
// and skips, each on a logical day. Pure.
import {
  type CompletionHistory,
  type CompletionKind,
  entryKind,
} from "../task/completion-history";
import type { CalendarDate, Task } from "../task/task";

/** One completion or skip the stats count. */
export interface CountedEntry {
  readonly kind: CompletionKind;
  readonly at: Date;
  /** The logical day it was recorded in. */
  readonly day: CalendarDate;
}

/** The completions and skips `task` counts for, oldest first. */
export function countedEntries(
  task: Pick<Task, "status" | "recurrence">,
  history: CompletionHistory,
): readonly CountedEntry[] {
  const all = history.map((entry) => ({
    kind: entryKind(entry),
    at: entry.at,
    day: entry.day,
  }));
  // A recurring task, paused or not: every completion and skip.
  if (task.recurrence.kind === "rule") return all;
  // Any other task: its skips, and its last completion while it is done.
  const last =
    task.status === "done"
      ? all.findLast((entry) => entry.kind === "completion")
      : undefined;
  return all.filter((entry) => entry.kind === "skip" || entry === last);
}
