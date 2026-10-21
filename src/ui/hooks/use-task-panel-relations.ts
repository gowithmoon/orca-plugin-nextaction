// What the task panel shows of a task's place among the others (its blocking
// reasons, dependencies, waiters, 所属项目 and the candidates for them), kept
// in step with the notes: read when the panel shows a task and again on
// every task change signal (ADR 0007), one read for every field. Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  ReadTaskPanelRelations,
  TaskPanelRelations,
} from "../../application/usecases/read-task-panel-relations";
import type { TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";
import { createLatestRead } from "./latest-read";

/**
 * The relations of task `id`, `null` until the first read ends. A new read
 * keeps what is shown until it ends; only the latest read counts. A failed
 * read is told once per failure and leaves the last shown; while task
 * features are paused the task panel already says so, so nothing is told.
 */
export function useTaskPanelRelations(
  readTaskPanelRelations: ReadTaskPanelRelations,
  id: TaskId,
  changes: ChangeSignalSource,
  notify: Notify,
): TaskPanelRelations | null {
  const [read, setRead] = React.useState<TaskPanelRelations | null>(null);
  const report = React.useRef(notify);
  report.current = notify;

  React.useEffect(() => {
    setRead(null);
    const reads = createLatestRead(
      () => readTaskPanelRelations(id),
      (outcome) => {
        if (outcome.kind === "loaded") setRead(outcome.data);
        else if (outcome.kind === "failed") {
          report.current(
            "error",
            t(
              "Could not read the task's dependencies, blocking and project: ${reason}",
              { reason: describeError(outcome.error) },
            ),
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
  }, [readTaskPanelRelations, id, changes]);

  return read;
}
