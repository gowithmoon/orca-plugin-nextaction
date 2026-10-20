// The completion history popup's writes (#209): deleting one entry, or
// clearing them all, each one undo. Once written, the task is read again so
// the popup shows what the notes now hold. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  ClearCompletionHistory,
  CompletionEntryKey,
  DeleteCompletionEntry,
} from "../../application/usecases/delete-completion-entries";
import type {
  ReadTaskForPanel,
  TaskForPanel,
} from "../../application/usecases/read-task";
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { type Notify, notifyActionFailure } from "../notify";

export interface CompletionHistoryActionsDeps {
  deleteCompletionEntry: DeleteCompletionEntry;
  clearCompletionHistory: ClearCompletionHistory;
  /** The task read again after a write. */
  readTaskForPanel: ReadTaskForPanel;
  notify: Notify;
}

/**
 * Deletes an entry of task `id`'s completion history, or clears it, then
 * hands `onWritten` the task read again, `null` when the block is no longer
 * a task. A failure is told to the user; never throws. `busy` while one is
 * under way.
 */
export function useCompletionHistoryActions(
  deps: CompletionHistoryActionsDeps,
  id: TaskId,
  onWritten: (read: TaskForPanel | null) => void,
): {
  deleteEntry: (key: CompletionEntryKey) => void;
  clearAll: () => void;
  busy: boolean;
} {
  const [busy, setBusy] = React.useState(false);
  const run = React.useCallback(
    (write: () => Promise<void>, failed: (reason: string) => string) => {
      if (busy) return;
      setBusy(true);
      void (async () => {
        try {
          await write();
        } catch (error) {
          notifyActionFailure(deps.notify, error, failed);
          setBusy(false);
          return;
        }
        try {
          onWritten(await deps.readTaskForPanel(id));
        } catch {
          // Written; the task panel reads it again on the change signal.
          onWritten(null);
        }
      })();
    },
    [busy, deps, id, onWritten],
  );
  const deleteEntry = React.useCallback(
    (key: CompletionEntryKey) =>
      run(
        () => deps.deleteCompletionEntry(id, key),
        (reason) => t("Could not delete: ${reason}", { reason }),
      ),
    [run, deps, id],
  );
  const clearAll = React.useCallback(
    () =>
      run(
        () => deps.clearCompletionHistory(id),
        (reason) => t("Could not clear: ${reason}", { reason }),
      ),
    [run, deps, id],
  );
  return { deleteEntry, clearAll, busy };
}
