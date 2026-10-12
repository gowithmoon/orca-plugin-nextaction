// Discarding a task's recurrence rule, review plan or reminders that this
// plugin cannot read, at the user's request in their popup (#106). Once
// discarded, the task is read again so the popup shows it afresh, with the
// empty value to edit. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { DiscardableData } from "../../application/ports/task-repository";
import type { DiscardUnreadable } from "../../application/usecases/discard-unreadable";
import type { ReadTask } from "../../application/usecases/read-task";
import type { Task, TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { type Notify, notifyActionFailure } from "../notify";

export interface DiscardUnreadableDeps {
  discardUnreadable: DiscardUnreadable;
  readTask: ReadTask;
  notify: Notify;
}

/**
 * Discards task `id`'s `data`, then hands `onDiscarded` the task read again,
 * `null` when the block is no longer a task. A failure is told to the user;
 * never throws. `busy` while it is under way.
 */
export function useDiscardUnreadable(
  deps: DiscardUnreadableDeps,
  id: TaskId,
  data: DiscardableData,
  onDiscarded: (task: Task | null) => void,
): { discard: () => void; busy: boolean } {
  const [busy, setBusy] = React.useState(false);
  const discard = React.useCallback(() => {
    if (busy) return;
    setBusy(true);
    void (async () => {
      try {
        await deps.discardUnreadable(id, data);
        onDiscarded(await deps.readTask(id));
      } catch (error) {
        notifyActionFailure(deps.notify, error, (reason) =>
          t("Could not discard: ${reason}", { reason }),
        );
        setBusy(false);
      }
    })();
  }, [busy, deps, id, data, onDiscarded]);
  return { discard, busy };
}
