// The task panel's 所属项目 field (#146): what the task's project is and the
// projects offered, read when the panel shows a task and again on every task
// change signal (ADR 0007). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  ProjectCandidate,
  ReadProjectCandidates,
} from "../../application/usecases/read-project-candidates";
import type {
  ProjectOfTaskRead,
  ReadProjectOfTask,
} from "../../application/usecases/read-project-of-task";
import type { TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";
import { createLatestRead } from "./latest-read";

export interface ProjectOfTaskShown {
  /** `null` until the first read ends. */
  readonly read: ProjectOfTaskRead | null;
  readonly candidates: readonly ProjectCandidate[];
}

const none: ProjectOfTaskShown = { read: null, candidates: [] };

/**
 * The 所属项目 of task `id` with the project candidates, from one read each,
 * together. A new read keeps what is shown until it ends; only the latest
 * counts. A failed read is told once per failure and leaves the last shown.
 */
export function useProjectOfTask(
  readProjectOfTask: ReadProjectOfTask,
  readProjectCandidates: ReadProjectCandidates,
  id: TaskId,
  changes: ChangeSignalSource,
  notify: Notify,
): ProjectOfTaskShown {
  const [shown, setShown] = React.useState<ProjectOfTaskShown>(none);
  const report = React.useRef(notify);
  report.current = notify;

  React.useEffect(() => {
    setShown(none);
    const reads = createLatestRead(
      async () => {
        const [read, candidates] = await Promise.all([
          readProjectOfTask(id),
          readProjectCandidates(id),
        ]);
        return { read, candidates };
      },
      (outcome) => {
        if (outcome.kind === "loaded") setShown(outcome.data);
        else if (outcome.kind === "failed") {
          report.current(
            "error",
            t("Could not read the project of the task: ${reason}", {
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
  }, [readProjectOfTask, readProjectCandidates, id, changes]);

  return shown;
}
