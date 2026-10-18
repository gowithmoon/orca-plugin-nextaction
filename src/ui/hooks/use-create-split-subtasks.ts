// Writes the subtasks confirmed in the "Split into subtasks" window (#202)
// and tells the user what happened. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  ConfirmedSplit,
  CreateSplitSubtasks,
} from "../../application/usecases/create-split-subtasks";
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { createNotify, notifyActionFailure } from "../notify";

/**
 * `created`: the window closes. Otherwise it stays open as it is: `empty`
 * (no name left), `failed` (the user was told why) or `busy` (a write is
 * still running).
 */
export type SplitOutcome = "created" | "empty" | "failed" | "busy";

export function useCreateSplitSubtasks(
  createSplitSubtasks: CreateSplitSubtasks,
  pluginName: string,
): (parentId: TaskId, confirmed: ConfirmedSplit) => Promise<SplitOutcome> {
  // Two quick clicks must not write twice.
  const running = React.useRef(false);
  return React.useCallback(
    async (parentId, confirmed) => {
      if (running.current) return "busy";
      running.current = true;
      const notify = createNotify(pluginName);
      try {
        const result = await createSplitSubtasks(parentId, confirmed);
        if (result.kind === "empty") return "empty";
        notify(
          "success",
          t("${count} subtasks created", { count: String(result.count) }),
        );
        return "created";
      } catch (error) {
        notifyActionFailure(notify, error, (reason) =>
          t("Could not create the subtasks: ${reason}", { reason }),
        );
        return "failed";
      } finally {
        running.current = false;
      }
    },
    [createSplitSubtasks, pluginName],
  );
}
