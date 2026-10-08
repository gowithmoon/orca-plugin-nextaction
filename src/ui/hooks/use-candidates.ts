// The candidate values of contexts or labels for the task panel (#35 "读取候选
// 值"): read when the field shows and again on every task change signal
// (ADR 0007), so a value just added is offered at once. Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import {
  type ChoiceProperty,
  TaskFeaturesPausedError,
} from "../../application/ports/task-repository";
import type { ReadCandidates } from "../../application/usecases/read-candidates";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";

/**
 * The candidates of `property`, empty until the first read ends. A failed
 * read is told once per failure and leaves the last candidates; while task
 * features are paused the task panel already says so, so nothing is told.
 */
export function useCandidates(
  readCandidates: ReadCandidates,
  property: ChoiceProperty,
  changes: ChangeSignalSource,
  notify: Notify,
): readonly string[] {
  const [candidates, setCandidates] = React.useState<readonly string[]>([]);
  const report = React.useRef(notify);
  report.current = notify;

  React.useEffect(() => {
    let latest = 0;
    let active = true;
    const read = () => {
      latest += 1;
      const mine = latest;
      readCandidates(property).then(
        (values) => {
          if (active && mine === latest) setCandidates(values);
        },
        (error: unknown) => {
          if (!active || mine !== latest) return;
          if (error instanceof TaskFeaturesPausedError) return;
          report.current(
            "error",
            t("Could not read the suggestions: ${reason}", {
              reason: describeError(error),
            }),
          );
        },
      );
    };
    read();
    const unsubscribe = changes.subscribe(read);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [readCandidates, property, changes]);

  return candidates;
}
