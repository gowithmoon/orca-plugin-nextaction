// Writes the tasks confirmed in the "Extract tasks" window (#204) and tells
// the user what happened. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  ConfirmedExtractedTask,
  CreateExtractedTasks,
  ExtractPlacement,
} from "../../application/usecases/create-extracted-tasks";
import { t } from "../../shared/l10n/l10n";
import { createNotify, notifyActionFailure } from "../notify";

/**
 * `created`: the window closes. Otherwise it stays open as it is: `empty`
 * (no name left), `failed` (the user was told why) or `busy` (a write is
 * still running).
 */
export type ExtractOutcome = "created" | "empty" | "failed" | "busy";

export function useCreateExtractedTasks(
  createExtractedTasks: CreateExtractedTasks,
  pluginName: string,
): (
  selected: readonly number[],
  placement: ExtractPlacement,
  tasks: readonly ConfirmedExtractedTask[],
) => Promise<ExtractOutcome> {
  // Two quick clicks must not write twice.
  const running = React.useRef(false);
  return React.useCallback(
    async (selected, placement, tasks) => {
      if (running.current) return "busy";
      running.current = true;
      const notify = createNotify(pluginName);
      try {
        const result = await createExtractedTasks(selected, placement, tasks);
        if (result.kind === "empty") return "empty";
        notify(
          "success",
          t("${count} tasks created", { count: String(result.count) }),
        );
        return "created";
      } catch (error) {
        notifyActionFailure(notify, error, (reason) =>
          t("Could not create the tasks: ${reason}", { reason }),
        );
        return "failed";
      } finally {
        running.current = false;
      }
    },
    [createExtractedTasks, pluginName],
  );
}
