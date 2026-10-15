// The projects quick capture offers as 所属项目 (#151): the task panel's
// candidates (#146), read once when the window opens. The window is open only
// for a moment, so no change signal is listened to. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  ProjectCandidate,
  ReadProjectCandidates,
} from "../../application/usecases/read-project-candidates";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";
import { createLatestRead } from "./latest-read";

/**
 * The candidates, empty until the read ends. A failed read is told once and
 * leaves none offered; the task can still be captured without a project.
 * While task features are paused the capture itself says so.
 */
export function useProjectCandidates(
  readProjectCandidates: ReadProjectCandidates,
  notify: Notify,
): readonly ProjectCandidate[] {
  const [candidates, setCandidates] = React.useState<
    readonly ProjectCandidate[]
  >([]);
  const report = React.useRef(notify);
  report.current = notify;

  React.useEffect(() => {
    const reads = createLatestRead(
      () => readProjectCandidates(),
      (outcome) => {
        if (outcome.kind === "loaded") setCandidates(outcome.data);
        else if (outcome.kind === "failed") {
          report.current(
            "error",
            t("Could not read the projects: ${reason}", {
              reason: describeError(outcome.error),
            }),
          );
        }
      },
    );
    reads.run();
    return reads.cancel;
  }, [readProjectCandidates]);

  return candidates;
}
