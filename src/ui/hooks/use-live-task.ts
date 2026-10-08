// A task kept in step with the notes, for the task panel: read when it opens
// and again on every task change signal (ADR 0007). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ReadTask } from "../../application/usecases/read-task";
import type { Task, TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { createLatestRead } from "./latest-read";

export type LiveTaskState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly task: Task }
  /** The block is no longer a task (dropped, deleted, tag removed). */
  | { readonly kind: "gone" }
  | { readonly kind: "failed"; readonly error: unknown }
  | { readonly kind: "paused" };

/**
 * Task `id` as the notes hold it. A new read keeps what is shown until it
 * ends; only the latest read counts. `reload` reads again at once (e.g. after
 * a write failed, to show what the notes really hold).
 */
export function useLiveTask(
  readTask: ReadTask,
  id: TaskId,
  changes: ChangeSignalSource,
): { state: LiveTaskState; reload: () => void } {
  const [state, setState] = React.useState<LiveTaskState>({ kind: "loading" });
  const reads = React.useMemo(
    () =>
      createLatestRead(
        () => readTask(id),
        (outcome) => {
          if (outcome.kind !== "loaded") setState(outcome);
          else if (outcome.data) {
            setState({ kind: "loaded", task: outcome.data });
          } else setState({ kind: "gone" });
        },
      ),
    [readTask, id],
  );
  const reload = React.useCallback(() => reads.run(), [reads]);

  React.useEffect(() => {
    setState({ kind: "loading" });
    reads.run();
    const unsubscribe = changes.subscribe(reads.run);
    return () => {
      unsubscribe();
      // A read still under way after the panel closed or moved on is ignored.
      reads.cancel();
    };
  }, [reads, changes]);

  return { state, reload };
}
