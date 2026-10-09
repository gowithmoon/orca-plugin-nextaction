// Runs the quick capture use case for the window and tells the user what
// happened. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { InitialProperties } from "../../application/ports/task-repository";
import type { QuickCapture } from "../../application/usecases/quick-capture";
import { t } from "../../shared/l10n/l10n";
import { createNotify, notifyFailure } from "../notify";

/**
 * `captured`: the window closes. Otherwise it stays open with its text and
 * properties: `empty` (blank text), `failed` (the user was told why) or
 * `busy` (a capture is still running).
 */
export type CaptureOutcome = "captured" | "empty" | "failed" | "busy";

export function useQuickCapture(
  quickCapture: QuickCapture,
  pluginName: string,
): (text: string, initial: InitialProperties) => Promise<CaptureOutcome> {
  // Two quick Enters must not capture twice.
  const running = React.useRef(false);

  return React.useCallback(
    async (
      text: string,
      initial: InitialProperties,
    ): Promise<CaptureOutcome> => {
      if (running.current) return "busy";
      running.current = true;
      const notify = createNotify(pluginName);
      try {
        const result = await quickCapture(text, initial);
        if (result.kind === "empty") return "empty";
        notify("success", t("Task created and added to today's journal"));
        return "captured";
      } catch (error) {
        notifyFailure(notify, error, {
          paused: t(
            "Task features are paused, so the task was not created. See the plugin's earlier notice or its task tag setting.",
          ),
          failed: (reason) =>
            t("Could not create the task: ${reason}", { reason }),
        });
        return "failed";
      } finally {
        running.current = false;
      }
    },
    [quickCapture, pluginName],
  );
}
