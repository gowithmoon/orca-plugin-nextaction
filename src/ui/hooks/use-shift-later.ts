// Shifting later the tasks after a task (GLOSSARY: 顺延, #184), from the
// gantt chart's notice and a bar's context menu: one write, one undo; the
// count shifted is told, a failure too. The chart read again (the task
// changes signal) shows the new dates. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ShiftLater } from "../../application/usecases/shift-later";
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { type Notify, notifyActionFailure } from "../notify";

/** How many tasks were shifted; 0 for none or a failure. Never throws. */
export type ShiftTasksLater = (id: TaskId) => Promise<number>;

export function useShiftLater(
  shiftLater: ShiftLater,
  notify: Notify,
): ShiftTasksLater {
  return React.useCallback(
    async (id) => {
      try {
        const shifted = await shiftLater(id);
        if (shifted > 0) {
          notify(
            "success",
            t("Shifted ${count} tasks later", { count: String(shifted) }),
          );
        }
        return shifted;
      } catch (error) {
        notifyActionFailure(notify, error, (reason) =>
          t("Could not save the change: ${reason}", { reason }),
        );
        return 0;
      }
    },
    [shiftLater, notify],
  );
}
