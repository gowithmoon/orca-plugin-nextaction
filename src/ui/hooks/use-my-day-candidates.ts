// The tasks the My Day view offers to add (#83): read when the view shows and
// again on every task change signal (ADR 0007), as the dependency candidates
// are. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  MyDayCandidate,
  ReadMyDayCandidates,
} from "../../application/usecases/read-my-day-candidates";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";
import { createLatestRead } from "./latest-read";

const none: readonly MyDayCandidate[] = [];

/**
 * The My Day candidates, none until the first read ends. A failed read is
 * told once per failure and leaves the last candidates; while task features
 * are paused the view already says so, so nothing is told.
 */
export function useMyDayCandidates(
  readMyDayCandidates: ReadMyDayCandidates,
  changes: ChangeSignalSource,
  notify: Notify,
): readonly MyDayCandidate[] {
  const [candidates, setCandidates] =
    React.useState<readonly MyDayCandidate[]>(none);
  const report = React.useRef(notify);
  report.current = notify;

  React.useEffect(() => {
    const reads = createLatestRead(readMyDayCandidates, (outcome) => {
      if (outcome.kind === "loaded") setCandidates(outcome.data);
      else if (outcome.kind === "failed") {
        report.current(
          "error",
          t("Could not read the tasks to add: ${reason}", {
            reason: describeError(outcome.error),
          }),
        );
      }
    });
    reads.run();
    const unsubscribe = changes.subscribe(reads.run);
    return () => {
      unsubscribe();
      reads.cancel();
    };
  }, [readMyDayCandidates, changes]);

  return candidates;
}
