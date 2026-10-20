// The tasks that depend on a task, kept in step with the notes for the task
// panel's 后续任务 row (#208): read when the panel shows a task and again on
// every task change signal (ADR 0007). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  Dependent,
  ReadDependents,
} from "../../application/usecases/read-dependents";
import type { TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";
import { createLatestRead } from "./latest-read";

const none: readonly Dependent[] = [];

/**
 * The dependents of task `id`, none until the first read ends. A failed read
 * is told once per failure and leaves the last dependents; while task
 * features are paused the task panel already says so, so nothing is told.
 */
export function useDependents(
  readDependents: ReadDependents,
  id: TaskId,
  changes: ChangeSignalSource,
  notify: Notify,
): readonly Dependent[] {
  const [dependents, setDependents] =
    React.useState<readonly Dependent[]>(none);
  const report = React.useRef(notify);
  report.current = notify;

  React.useEffect(() => {
    setDependents(none);
    const reads = createLatestRead(
      () => readDependents(id),
      (outcome) => {
        if (outcome.kind === "loaded") setDependents(outcome.data);
        else if (outcome.kind === "failed") {
          report.current(
            "error",
            t("Could not read the tasks that depend on this one: ${reason}", {
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
  }, [readDependents, id, changes]);

  return dependents;
}
