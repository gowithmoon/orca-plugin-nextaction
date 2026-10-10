// Why a task is not a next action, kept in step with the notes for the task
// panel's row of that name (#54, #78): read when the panel shows a task and again on
// every task change signal (ADR 0007). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  NotNextActionReasonsRead,
  ReadNotNextActionReasons,
} from "../../application/usecases/read-not-next-action-reasons";
import type { TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";
import { createLatestRead } from "./latest-read";

const none: NotNextActionReasonsRead = {
  reasons: [],
  tasks: new Map(),
  dependencies: [],
};

/**
 * Why task `id` is not a next action, none until the first read ends. A new
 * read keeps what is shown until it ends; only the latest read counts. A
 * failed read is told once per failure and leaves the last reasons; while
 * task features are paused the task panel already says so, so nothing is
 * told.
 */
export function useNotNextActionReasons(
  readNotNextActionReasons: ReadNotNextActionReasons,
  id: TaskId,
  changes: ChangeSignalSource,
  notify: Notify,
): NotNextActionReasonsRead {
  const [read, setRead] = React.useState<NotNextActionReasonsRead>(none);
  const report = React.useRef(notify);
  report.current = notify;

  React.useEffect(() => {
    setRead(none);
    const reads = createLatestRead(
      () => readNotNextActionReasons(id),
      (outcome) => {
        if (outcome.kind === "loaded") setRead(outcome.data);
        else if (outcome.kind === "failed") {
          report.current(
            "error",
            t("Could not read why the task is not a next action: ${reason}", {
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
  }, [readNotNextActionReasons, id, changes]);

  return read;
}
