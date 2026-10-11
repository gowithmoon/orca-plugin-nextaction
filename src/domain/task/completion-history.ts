// Completion history (GLOSSARY: 完成历史). Pure: the completion's time and
// logical day are passed in.
import type { CalendarDate, TaskStatus } from "./task";

/**
 * What an entry of the completion history records (GLOSSARY: 完成历史): a
 * completion, or a skip of a recurring task's occurrence (GLOSSARY: 跳过,
 * #91).
 */
export const completionKinds = ["completion", "skip"] as const;
export type CompletionKind = (typeof completionKinds)[number];

/**
 * One entry: when it happened, the logical day it fell in and what it
 * records. Without `kind` it is a completion (entries recorded before
 * skipping existed have none).
 */
export interface CompletionEntry {
  readonly at: Date;
  readonly day: CalendarDate;
  readonly kind?: CompletionKind;
}

/** What `entry` records: a completion when it has no kind. */
export function entryKind(entry: CompletionEntry): CompletionKind {
  return entry.kind ?? "completion";
}

/** A task's completions and skips, oldest first. */
export type CompletionHistory = readonly CompletionEntry[];

/**
 * The last completion recorded (GLOSSARY: 完成历史: "the last completion"
 * looks at completions only), skips passed over; `undefined` without one.
 */
export function lastCompletion(
  history: CompletionHistory,
): CompletionEntry | undefined {
  return history.findLast((entry) => entryKind(entry) === "completion");
}

/** The last skip recorded (GLOSSARY: 跳过); `undefined` without one. */
export function lastSkip(
  history: CompletionHistory,
): CompletionEntry | undefined {
  return history.findLast((entry) => entry.kind === "skip");
}

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
