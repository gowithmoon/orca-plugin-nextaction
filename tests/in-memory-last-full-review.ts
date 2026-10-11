// A LastFullReviewStore for tests: it holds the moment in memory.
import type { LastFullReviewStore } from "../src/application/ports/last-full-review";

export function createInMemoryLastFullReview(
  at: Date | string | null = null,
): LastFullReviewStore {
  let current = at === null ? null : new Date(at);
  return {
    // A copy, so a caller mutating the Date cannot move the moment.
    read: async () => (current === null ? null : new Date(current)),
    async write(next) {
      current = new Date(next);
    },
  };
}
