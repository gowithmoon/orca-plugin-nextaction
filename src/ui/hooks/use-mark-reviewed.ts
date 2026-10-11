// Marking a task reviewed from a review view card (GLOSSARY: 标记已回顾, #98).
// A failure is told to the user; success says nothing, the card's new look
// is the answer. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { MarkReviewed } from "../../application/usecases/mark-reviewed";
import type { TaskId } from "../../domain/task/task";
import { type Notify, notifyMarkReviewedFailure } from "../notify";

/** Marks a task reviewed and reports a failure. Never throws. */
export function useMarkReviewed(
  markReviewed: MarkReviewed,
  notify: Notify,
): (id: TaskId) => void {
  return React.useCallback(
    (id) => {
      void (async () => {
        try {
          await markReviewed(id);
        } catch (error) {
          notifyMarkReviewedFailure(notify, error);
        }
      })();
    },
    [markReviewed, notify],
  );
}
