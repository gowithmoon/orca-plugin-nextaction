// The candidate values of contexts and labels for the task panel (#35 "读取候选
// 值"): read when the panel shows and again on every task change signal
// (ADR 0007), so a value just added is offered at once. One read serves both
// fields. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { Candidates } from "../../application/ports/task-repository";
import type { ReadCandidates } from "../../application/usecases/read-candidates";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";
import { createLatestRead } from "./latest-read";

const none: Candidates = { contexts: [], labels: [] };

/**
 * The candidates, empty until the first read ends. A failed read is told
 * once per failure and leaves the last candidates; while task features are
 * paused the task panel already says so, so nothing is told.
 */
export function useCandidates(
  readCandidates: ReadCandidates,
  changes: ChangeSignalSource,
  notify: Notify,
): Candidates {
  const [candidates, setCandidates] = React.useState<Candidates>(none);
  const report = React.useRef(notify);
  report.current = notify;

  React.useEffect(() => {
    const reads = createLatestRead(readCandidates, (outcome) => {
      if (outcome.kind === "loaded") setCandidates(outcome.data);
      else if (outcome.kind === "failed") {
        report.current(
          "error",
          t("Could not read the suggestions: ${reason}", {
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
  }, [readCandidates, changes]);

  return candidates;
}
