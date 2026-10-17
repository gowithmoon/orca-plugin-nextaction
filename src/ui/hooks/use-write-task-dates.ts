// Writing a task's start and due dates together, as the gantt chart's drag
// does (#180): one edit task write, one undo. Success says nothing, the
// chart read again shows it; a failure is told to the user. Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { EditTask } from "../../application/usecases/edit-task";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { type Notify, notifyActionFailure } from "../notify";

/** Whether the dates were written. Never throws. */
export type WriteTaskDates = (
  id: TaskId,
  dates: { readonly start: CalendarDate; readonly due: CalendarDate },
) => Promise<boolean>;

export function useWriteTaskDates(
  editTask: EditTask,
  notify: Notify,
): WriteTaskDates {
  return React.useCallback(
    async (id, dates) => {
      try {
        await editTask(id, { start: dates.start, due: dates.due });
        return true;
      } catch (error) {
        notifyActionFailure(notify, error, (reason) =>
          t("Could not save the change: ${reason}", { reason }),
        );
        return false;
      }
    },
    [editTask, notify],
  );
}
