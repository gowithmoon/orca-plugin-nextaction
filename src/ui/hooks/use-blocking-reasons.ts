// Why a task is blocked, kept in step with the notes for the task panel's
// blocking reasons row (#54): read when the panel shows a task and again on
// every task change signal (ADR 0007). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  BlockingReasonsRead,
  ReadBlockingReasons,
} from "../../application/usecases/read-blocking-reasons";
import type { TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";
import { createLatestRead } from "./latest-read";

const none: BlockingReasonsRead = {
  reasons: [],
  tasks: new Map(),
  dependencies: [],
};

/**
 * The blocking reasons of task `id`, none until the first read ends. A new
 * read keeps what is shown until it ends; only the latest read counts. A
 * failed read is told once per failure and leaves the last reasons; while
 * task features are paused the task panel already says so, so nothing is
 * told.
 */
export function useBlockingReasons(
  readBlockingReasons: ReadBlockingReasons,
  id: TaskId,
  changes: ChangeSignalSource,
  notify: Notify,
): BlockingReasonsRead {
  const [read, setRead] = React.useState<BlockingReasonsRead>(none);
  const report = React.useRef(notify);
  report.current = notify;

  React.useEffect(() => {
    setRead(none);
    const reads = createLatestRead(
      () => readBlockingReasons(id),
      (outcome) => {
        if (outcome.kind === "loaded") setRead(outcome.data);
        else if (outcome.kind === "failed") {
          report.current(
            "error",
            t("Could not read why the task is blocked: ${reason}", {
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
  }, [readBlockingReasons, id, changes]);

  return read;
}
