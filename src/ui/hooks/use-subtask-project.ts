// The project a new subtask will belong to (#190), shown read only in the
// "Create subtask" window: read once when the window opens, as its project
// candidates are. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ReadSubtaskProject } from "../../application/usecases/create-subtask";
import type { ProjectShown } from "../../application/usecases/read-project-of-task";
import type { TaskId } from "../../domain/task/task";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";
import { createLatestRead } from "./latest-read";

/**
 * The project, `null` until the read ends and when there is none. A failed
 * read is told once and shows none; the subtask still goes where it goes.
 */
export function useSubtaskProject(
  readSubtaskProject: ReadSubtaskProject,
  parentId: TaskId,
  notify: Notify,
): ProjectShown | null {
  const [project, setProject] = React.useState<ProjectShown | null>(null);
  const report = React.useRef(notify);
  report.current = notify;

  React.useEffect(() => {
    const reads = createLatestRead(
      () => readSubtaskProject(parentId),
      (outcome) => {
        if (outcome.kind === "loaded") setProject(outcome.data);
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
  }, [readSubtaskProject, parentId]);

  return project;
}
