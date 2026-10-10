// The tasks the task panel offers to add as dependencies (#57): read when the
// panel shows a task and again on every task change signal (ADR 0007).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  DependencyCandidate,
  ReadDependencyCandidates,
} from "../../application/usecases/read-dependency-candidates";
import type { TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";
import { createLatestRead } from "./latest-read";

const none: readonly DependencyCandidate[] = [];

/**
 * The dependency candidates for task `id`, none until the first read ends. A
 * failed read is told once per failure and leaves the last candidates; while
 * task features are paused the task panel already says so, so nothing is
 * told.
 */
export function useDependencyCandidates(
  readDependencyCandidates: ReadDependencyCandidates,
  id: TaskId,
  changes: ChangeSignalSource,
  notify: Notify,
): readonly DependencyCandidate[] {
  const [candidates, setCandidates] =
    React.useState<readonly DependencyCandidate[]>(none);
  const report = React.useRef(notify);
  report.current = notify;

  React.useEffect(() => {
    setCandidates(none);
    const reads = createLatestRead(
      () => readDependencyCandidates(id),
      (outcome) => {
        if (outcome.kind === "loaded") setCandidates(outcome.data);
        else if (outcome.kind === "failed") {
          report.current(
            "error",
            t("Could not read the tasks to depend on: ${reason}", {
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
      reads.cancel();
    };
  }, [readDependencyCandidates, id, changes]);

  return candidates;
}
