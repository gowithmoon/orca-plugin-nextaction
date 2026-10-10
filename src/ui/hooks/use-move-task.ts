// Moving a task from the all tasks view (#70). A refusal is told to the user;
// success says nothing, the task showing in its new place is the answer
// (#63). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import {
  MoveRefusedError,
  type MoveTask,
} from "../../application/usecases/move-task";
import type { TaskMove } from "../../domain/blocking/task-move";
import { t } from "../../shared/l10n/l10n";
import { type Notify, notifyActionFailure } from "../notify";

/** Moves a task and reports a refusal or a failure. Never throws. */
export function useMoveTask(
  moveTask: MoveTask,
  notify: Notify,
): (move: TaskMove) => void {
  return React.useCallback(
    (move) => {
      void (async () => {
        try {
          await moveTask(move);
        } catch (error) {
          if (error instanceof MoveRefusedError) {
            notify(
              "warn",
              error.reason === "page-level-only-pages"
                ? t("Not moved: only pages can go between pages.")
                : t("Not moved: a task cannot go below itself."),
            );
            return;
          }
          notifyActionFailure(notify, error, (reason) =>
            t("Could not move the task: ${reason}", { reason }),
          );
        }
      })();
    },
    [moveTask, notify],
  );
}
