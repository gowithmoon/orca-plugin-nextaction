// The review view's card actions (GLOSSARY: 回顾, #99): add to My Day, drop
// and the status changes of a step. Each is one write and one undo. A card
// shows no sign of My Day or of being dropped, so both say how they went;
// a status change says nothing, the card's new status is the answer.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { AddToMyDay } from "../../application/usecases/add-to-my-day";
import type { DropTask } from "../../application/usecases/drop-task";
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import {
  type Notify,
  notifyActionFailure,
  notifyMyDayFailure,
} from "../notify";

export interface ReviewCardActions {
  addToMyDay(id: TaskId): void;
  drop(id: TaskId): void;
}

/** Never throws: failures are told to the user. */
export function useReviewCardActions(deps: {
  addToMyDay: AddToMyDay;
  dropTask: DropTask;
  notify: Notify;
}): ReviewCardActions {
  const { addToMyDay, dropTask, notify } = deps;
  return React.useMemo(
    () => ({
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
    [addToMyDay, dropTask, notify],
  );
}
