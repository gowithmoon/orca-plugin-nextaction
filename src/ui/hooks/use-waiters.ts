// The tasks waiting for a task, kept in step with the notes for the task
// panel's 阻塞 row (#208, GLOSSARY: 它阻塞的任务): read when the panel shows a
// task and again on every task change signal (ADR 0007). Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  ReadWaiters,
  Waiter,
} from "../../application/usecases/read-waiters";
import type { TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";
import { createLatestRead } from "./latest-read";

const none: readonly Waiter[] = [];

/**
 * The waiters of task `id`, none until the first read ends. A failed read is
 * told once per failure and leaves the last waiters; while task features are
 * paused the task panel already says so, so nothing is told.
 */
export function useWaiters(
  readWaiters: ReadWaiters,
  id: TaskId,
  changes: ChangeSignalSource,
  notify: Notify,
): readonly Waiter[] {
  const [waiters, setWaiters] = React.useState<readonly Waiter[]>(none);
  const report = React.useRef(notify);
  report.current = notify;

  React.useEffect(() => {
    setWaiters(none);
    const reads = createLatestRead(
      () => readWaiters(id),
      (outcome) => {
        if (outcome.kind === "loaded") setWaiters(outcome.data);
        else if (outcome.kind === "failed") {
          report.current(
            "error",
            t("Could not read the tasks this one blocks: ${reason}", {
              reason: describeError(outcome.error),
            }),
          );
        }
      },
    );
    reads.run();
    const unsubscribe = changes.subscribe(reads.run);
    return () => {
      unsubscribe();
      // A read still under way after the panel closed or moved on is ignored.
      reads.cancel();
    };
  }, [readWaiters, id, changes]);

  return waiters;
}
