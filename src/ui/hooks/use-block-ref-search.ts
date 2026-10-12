// The search behind a block reference custom property's "add" (#115): each
// keyword typed asks the use case, which searches under the property's
// scope. Failures are told once per failed search; while task features are
// paused nothing is told (the task panel already says so). Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import {
  type BlockCandidate,
  TaskFeaturesPausedError,
} from "../../application/ports/task-repository";
import type { ReadBlockRefCandidates } from "../../application/usecases/read-block-ref-candidates";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";

/**
 * Searches the candidates of property `name` for `keyword`; a failed search
 * finds nothing.
 */
export function useBlockRefSearch(
  readBlockRefCandidates: ReadBlockRefCandidates,
  name: string,
  notify: Notify,
): (keyword: string) => Promise<readonly BlockCandidate[]> {
  const report = React.useRef(notify);
  report.current = notify;
  return React.useCallback(
    async (keyword) => {
      try {
        return await readBlockRefCandidates(name, keyword);
      } catch (error) {
        if (!(error instanceof TaskFeaturesPausedError)) {
          report.current(
            "error",
            t("Could not search the blocks: ${reason}", {
              reason: describeError(error),
            }),
          );
        }
        return [];
      }
    },
    [readBlockRefCandidates, name],
  );
}
