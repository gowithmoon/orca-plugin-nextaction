// The review view's card actions (GLOSSARY: 回顾, #99, #100): add to My Day,
// drop, a new due date and the status changes of a step. Each is one write
// and one undo. A card shows no sign of My Day or of being dropped, so both
// say how they went; a status change or a new due date says nothing, the
// card shows the answer.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { AddToMyDay } from "../../application/usecases/add-to-my-day";
import type { DropTask } from "../../application/usecases/drop-task";
import type { EditTask } from "../../application/usecases/edit-task";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import {
  type Notify,
  notifyActionFailure,
  notifyMyDayFailure,
} from "../notify";

export interface ReviewCardActions {
  addToMyDay(id: TaskId): void;
  drop(id: TaskId): void;
  /** Sets the due date, or clears it with `null` (the overdue step, #100). */
  reschedule(id: TaskId, due: CalendarDate | null): void;
}

/** Never throws: failures are told to the user. */
export function useReviewCardActions(deps: {
  addToMyDay: AddToMyDay;
  dropTask: DropTask;
  editTask: EditTask;
  notify: Notify;
}): ReviewCardActions {
  const { addToMyDay, dropTask, editTask, notify } = deps;
  return React.useMemo(
    () => ({
      reschedule(id, due) {
        void (async () => {
          try {
            // Says nothing: the kept card shows its new due date.
            await editTask(id, { due });
          } catch (error) {
            notifyActionFailure(notify, error, (reason) =>
              t("Could not save the change: ${reason}", { reason }),
            );
          }
        })();
      },
      addToMyDay(id) {
        void (async () => {
          try {
            // Unchanged (already in today's My Day) says the same, as the
            // task menu does: the task is where the user wanted it.
            await addToMyDay(id);
            notify("success", t("Added to My Day"));
          } catch (error) {
            notifyMyDayFailure(notify, error);
          }
        })();
      },
      drop(id) {
        void (async () => {
          try {
            // No confirmation: one undo brings the task back.
            await dropTask(id);
            notify("info", t("Task dropped"));
          } catch (error) {
            notifyActionFailure(notify, error, (reason) =>
              t("Could not drop the task: ${reason}", { reason }),
            );
          }
        })();
      },
    }),
    [addToMyDay, dropTask, editTask, notify],
  );
}
