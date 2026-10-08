// Completion history (GLOSSARY: 完成历史). Pure: the completion's time and
// logical day are passed in.
import type { CalendarDate, TaskStatus } from "./task";

/** One completion: when it happened and the logical day it fell in. */
export interface CompletionEntry {
  readonly at: Date;
  readonly day: CalendarDate;
}

/** A task's completions, oldest first. */
export type CompletionHistory = readonly CompletionEntry[];

/** Whether changing the status from `from` to `to` records a completion. */
export function recordsCompletion(from: TaskStatus, to: TaskStatus): boolean {
  return from !== "done" && to === "done";
}

/**
 * The history after the status changes from `from` to `to` through the
 * plugin: entering done from another status appends `completion` at the end;
 * any other change, leaving done included, keeps the history as it is.
 */
export function historyAfterStatusChange(
  history: CompletionHistory,
  from: TaskStatus,
  to: TaskStatus,
  completion: CompletionEntry,
): CompletionHistory {
  return recordsCompletion(from, to) ? [...history, completion] : history;
}
