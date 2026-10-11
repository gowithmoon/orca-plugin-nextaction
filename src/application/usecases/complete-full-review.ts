// Use case: complete a full review (GLOSSARY: 完整回顾), from the summary's
// "Complete review": the moment now is recorded as when the last full review
// was completed. Nothing else counts: only the tasks due for review, or
// marking a task reviewed elsewhere, never records it.
import type { Clock } from "../ports/clock";
import type { LastFullReviewStore } from "../ports/last-full-review";

/** Completes the full review under way. Errors are thrown as they are. */
export type CompleteFullReview = () => Promise<void>;

export function createCompleteFullReview(deps: {
  clock: Clock;
  lastFullReview: LastFullReviewStore;
}): CompleteFullReview {
  return () => deps.lastFullReview.write(deps.clock.now());
}
