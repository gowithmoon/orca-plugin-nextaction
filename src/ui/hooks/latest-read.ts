// Reads that may overlap, where only the latest one counts: shared by the
// views' queries, the task panel's task and its candidates. Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
import { TaskFeaturesPausedError } from "../../application/ports/task-repository";

/** How a read ended. */
export type ReadOutcome<T> =
  | { readonly kind: "loaded"; readonly data: T }
  | { readonly kind: "failed"; readonly error: unknown }
  /** Task features are paused (`TaskFeaturesPausedError`). */
  | { readonly kind: "paused" };

/**
 * `run` starts a read of `read`; `onOutcome` hears how it ended, but only for
 * the latest read. `cancel` makes every read under way count for nothing.
 */
export function createLatestRead<T>(
  read: () => Promise<T>,
  onOutcome: (outcome: ReadOutcome<T>) => void,
): { run(): void; cancel(): void } {
  let latest = 0;
  return {
    run() {
      latest += 1;
      const mine = latest;
      read().then(
        (data) => {
          if (mine === latest) onOutcome({ kind: "loaded", data });
        },
        (error: unknown) => {
          if (mine !== latest) return;
          onOutcome(
            error instanceof TaskFeaturesPausedError
              ? { kind: "paused" }
              : { kind: "failed", error },
          );
        },
      );
    },
    cancel() {
      latest += 1;
    },
  };
}
