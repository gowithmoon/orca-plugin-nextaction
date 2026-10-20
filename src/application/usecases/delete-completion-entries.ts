// Use cases: delete one entry of a task's completion history (GLOSSARY:
// 完成历史), or clear it all, from the completion history popup (#209). A
// deleted entry is as if it never happened; the task's status, recurrence
// rule (its remaining occurrences included) and other properties stay as
// they are.
import {
  type CompletionKind,
  entryKind,
} from "../../domain/task/completion-history";
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";
import { CompletionHistoryUnreadableError } from "./completion-history-unreadable-error";

/** Which entry to delete: its time and what it records. */
export interface CompletionEntryKey {
  readonly at: Date;
  readonly kind: CompletionKind;
}

/**
 * Deletes the entry `key` from task `id`'s completion history, in one undo.
 * Errors are thrown as they are, for `ui` to report.
 */
export type DeleteCompletionEntry = (
  id: TaskId,
  key: CompletionEntryKey,
) => Promise<void>;

export function createDeleteCompletionEntry(deps: {
  repository: TaskRepository;
}): DeleteCompletionEntry {
  return async (id, key) => {
    const read = await deps.repository.readCompletionHistory(id);
    // Only discarding overwrites what cannot be read (docs/ARCHITECTURE.md §4).
    if (read.kind === "unreadable") {
      throw new CompletionHistoryUnreadableError(id, read.reason);
    }
    const kept = read.history.filter(
      (entry) =>
        entry.at.getTime() !== key.at.getTime() ||
        entryKind(entry) !== key.kind,
    );
    // Not there (changed elsewhere since the popup read it): nothing to do.
    if (kept.length === read.history.length) return;
    await deps.repository.updateTask(id, { completionHistory: kept });
  };
}

/**
 * Deletes every entry of task `id`'s completion history, in one undo. Errors
 * are thrown as they are, for `ui` to report.
 */
export type ClearCompletionHistory = (id: TaskId) => Promise<void>;

export function createClearCompletionHistory(deps: {
  repository: TaskRepository;
}): ClearCompletionHistory {
  return async (id) => {
    const read = await deps.repository.readCompletionHistory(id);
    if (read.kind === "unreadable") {
      throw new CompletionHistoryUnreadableError(id, read.reason);
    }
    await deps.repository.updateTask(id, { completionHistory: [] });
  };
}
