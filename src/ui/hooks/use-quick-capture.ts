// Runs the quick capture use case for the popup and tells the user what
// happened. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import { TaskFeaturesPausedError } from "../../application/ports/task-repository";
import type { QuickCapture } from "../../application/usecases/quick-capture";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";

/**
 * `captured`: the popup closes. Otherwise it stays open with its text:
 * `empty` (blank text), `failed` (the user was told why) or `busy` (a capture
 * is still running).
 */
export type CaptureOutcome = "captured" | "empty" | "failed" | "busy";

export function useQuickCapture(
  quickCapture: QuickCapture,
  pluginName: string,
): (text: string) => Promise<CaptureOutcome> {
  // Two quick Enters must not capture twice.
  const running = React.useRef(false);

  return React.useCallback(
    async (text: string): Promise<CaptureOutcome> => {
      if (running.current) return "busy";
      running.current = true;
      try {
        const result = await quickCapture(text);
        if (result.kind === "empty") return "empty";
        orca.notify("success", t("Task created and added to today's journal"), {
          title: pluginName,
        });
        return "captured";
      } catch (error) {
        if (error instanceof TaskFeaturesPausedError) {
          orca.notify(
            "warn",
            t(
              "Task features are paused, so the task was not created. See the plugin's earlier notice or its task tag setting.",
            ),
            { title: pluginName },
          );
        } else {
          orca.notify(
            "error",
            t("Could not create the task: ${reason}", {
              reason: describeError(error),
            }),
            { title: pluginName },
          );
        }
        return "failed";
      } finally {
        running.current = false;
      }
    },
    [quickCapture, pluginName],
  );
}
