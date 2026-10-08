// A task kept in step with the notes, for the task panel: read when it opens
// and again on every task change signal (ADR 0007). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import { TaskFeaturesPausedError } from "../../application/ports/task-repository";
import type { ReadTask } from "../../application/usecases/read-task";
import type { Task, TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";

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
  const latest = React.useRef(0);

  const reload = React.useCallback(() => {
    latest.current += 1;
    const mine = latest.current;
    readTask(id).then(
      (task) => {
        if (mine !== latest.current) return;
        setState(task ? { kind: "loaded", task } : { kind: "gone" });
      },
      (error: unknown) => {
        if (mine !== latest.current) return;
        setState(
          error instanceof TaskFeaturesPausedError
            ? { kind: "paused" }
            : { kind: "failed", error },
        );
      },
    );
  }, [readTask, id]);

  React.useEffect(() => {
    setState({ kind: "loading" });
    reload();
    const unsubscribe = changes.subscribe(reload);
    return () => {
      unsubscribe();
      // A read still under way after the panel closed or moved on is ignored.
      latest.current += 1;
    };
  }, [reload, changes]);

  return { state, reload };
}
