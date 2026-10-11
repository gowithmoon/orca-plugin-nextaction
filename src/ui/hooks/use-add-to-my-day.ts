// Adding a task to today's My Day from the My Day view (#83). A failure is
// told to the user; success says nothing, the task showing in the view is
// the answer. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { AddToMyDay } from "../../application/usecases/add-to-my-day";
import type { TaskId } from "../../domain/task/task";
import { type Notify, notifyMyDayFailure } from "../notify";

/** Adds a task to today's My Day and reports a failure. Never throws. */
export function useAddToMyDay(
  addToMyDay: AddToMyDay,
  notify: Notify,
): (id: TaskId) => void {
  return React.useCallback(
    (id) => {
      void (async () => {
        try {
          await addToMyDay(id);
        } catch (error) {
          notifyMyDayFailure(notify, error);
        }
      })();
    },
    [addToMyDay, notify],
  );
}
