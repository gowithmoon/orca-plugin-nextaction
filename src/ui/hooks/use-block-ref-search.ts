// The search behind a block reference custom property's "add" (#115): the
// keyword typed asks the use case, which searches under the property's
// scope, once typing pauses briefly. Only the latest keyword's results count:
// every search still waiting resolves to them, so a slow earlier answer never
// replaces a newer one. A failure is told once until a search succeeds
// again; while task features are paused nothing is told (the task panel
// already says so). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import {
  type BlockCandidate,
  TaskFeaturesPausedError,
} from "../../application/ports/task-repository";
import type { ReadBlockRefCandidates } from "../../application/usecases/read-block-ref-candidates";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";

/** How long typing pauses before Orca is asked. */
const debounceMs = 200;

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
  /** Counts searches: only the latest one asks Orca and counts. */
  const latestSeq = React.useRef(0);
  /** The latest search's results, for the searches it replaced. */
  const latest = React.useRef<Promise<readonly BlockCandidate[]>>(
    Promise.resolve([]),
  );
  /** A failure was told and no search has succeeded since. */
  const failing = React.useRef(false);
  const timers = React.useRef(new Set<ReturnType<typeof setTimeout>>());
  // The timers live with the component (ARCHITECTURE §4, React).
  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return React.useCallback(
    (keyword) => {
      latestSeq.current += 1;
      const seq = latestSeq.current;
      const search = (async () => {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            timers.current.delete(timer);
            resolve();
          }, debounceMs);
          timers.current.add(timer);
        });
        // Typing went on: the newer search answers for this one.
        if (seq !== latestSeq.current) return latest.current;
        try {
          const found = await readBlockRefCandidates(name, keyword);
          failing.current = false;
          return found;
        } catch (error) {
          if (!(error instanceof TaskFeaturesPausedError) && !failing.current) {
            failing.current = true;
            report.current(
              "error",
              t("Could not search the blocks: ${reason}", {
                reason: describeError(error),
              }),
            );
          }
          return [];
        }
      })();
      latest.current = search;
      // A search overtaken while Orca answers resolves to the newest one.
      return search.then((found) =>
        seq === latestSeq.current ? found : latest.current,
      );
    },
    [readBlockRefCandidates, name],
  );
}
