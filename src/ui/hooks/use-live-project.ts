// A project kept in step with the notes, for the project panel (#232): read
// when it opens and again on every change signal (ADR 0007), as the task
// panel's task (use-live-task.ts). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ReadProjectForPanel } from "../../application/usecases/read-project-for-panel";
import type { TaskCustomProperty } from "../../application/usecases/read-task";
import type { Project, ProjectId } from "../../domain/project/project";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { createLatestRead } from "./latest-read";

export type LiveProjectState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "loaded";
      readonly project: Project;
      /** The project tag's custom properties, in Orca's order (#235). */
      readonly customProperties: readonly TaskCustomProperty[];
    }
  /** The block is no longer a project (dropped, deleted, tag removed). */
  | { readonly kind: "gone" }
  | { readonly kind: "failed"; readonly error: unknown }
  /** Task features are paused. */
  | { readonly kind: "paused" }
  /** The project tag is paused (#143). */
  | { readonly kind: "projectsPaused" };

/**
 * Project `id` as the notes hold it. A new read keeps what is shown until it
 * ends; only the latest read counts. `reload` reads again at once (e.g.
 * after a write failed). `projectsPaused` tells a project tag paused apart
 * from a block that is no longer a project, both of which read as none.
 */
export function useLiveProject(
  readProjectForPanel: ReadProjectForPanel,
  id: ProjectId,
  changes: ChangeSignalSource,
  projectsPaused: () => boolean,
): { state: LiveProjectState; reload: () => void } {
  const [state, setState] = React.useState<LiveProjectState>({
    kind: "loading",
  });
  const paused = React.useRef(projectsPaused);
  paused.current = projectsPaused;
  const reads = React.useMemo(
    () =>
      createLatestRead(
        () => readProjectForPanel(id),
        (outcome) => {
          if (outcome.kind !== "loaded") setState(outcome);
          else if (outcome.data) {
            setState({ kind: "loaded", ...outcome.data });
          } else if (paused.current()) setState({ kind: "projectsPaused" });
          else setState({ kind: "gone" });
        },
      ),
    [readProjectForPanel, id],
  );
  const reload = React.useCallback(() => reads.run(), [reads]);

  React.useEffect(() => {
    setState({ kind: "loading" });
    reads.run();
    const unsubscribe = changes.subscribe(reads.run);
    return () => {
      unsubscribe();
      // A read still under way after the panel closed or moved on is ignored.
      reads.cancel();
    };
  }, [reads, changes]);

  return { state, reload };
}
