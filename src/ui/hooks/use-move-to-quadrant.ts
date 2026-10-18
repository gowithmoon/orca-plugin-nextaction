// Moving a task to another quadrant of My Day's quadrant layout (GLOSSARY:
// 四象限, #199), as dragging its card there does: one write, one undo, or
// none when it is already there. Success says nothing, the card in its new
// quadrant is the answer; a failure is told to the user. Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { MoveToQuadrant } from "../../application/usecases/move-to-quadrant";
import type { Quadrant } from "../../domain/task/quadrant";
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { type Notify, notifyActionFailure } from "../notify";

/** Whether the move succeeded (nothing to write counts as success). Never throws. */
export type WriteQuadrant = (id: TaskId, target: Quadrant) => Promise<boolean>;

export function useMoveToQuadrant(
  moveToQuadrant: MoveToQuadrant,
  notify: Notify,
): WriteQuadrant {
  return React.useCallback(
    async (id, target) => {
      try {
        await moveToQuadrant(id, target);
        return true;
      } catch (error) {
        notifyActionFailure(notify, error, (reason) =>
          t("Could not save the change: ${reason}", { reason }),
        );
        return false;
      }
    },
    [moveToQuadrant, notify],
  );
}
