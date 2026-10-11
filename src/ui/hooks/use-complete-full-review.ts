// The summary's "Complete review" (GLOSSARY: 完整回顾, #101): records the
// moment, then `onDone` (back to the start page). A failure is told to the
// user and the full review stays where it was. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { CompleteFullReview } from "../../application/usecases/complete-full-review";
import { t } from "../../shared/l10n/l10n";
import { type Notify, notifyActionFailure } from "../notify";

/** Completes the full review. Never throws. */
export function useCompleteFullReview(
  completeFullReview: CompleteFullReview,
  notify: Notify,
  onDone: () => void,
): () => void {
  return React.useCallback(() => {
    void (async () => {
      try {
        await completeFullReview();
      } catch (error) {
        notifyActionFailure(notify, error, (reason) =>
          t("Could not complete the review: ${reason}", { reason }),
        );
        return;
      }
      notify("success", t("Review completed"));
      onDone();
    })();
  }, [completeFullReview, notify, onDone]);
}
