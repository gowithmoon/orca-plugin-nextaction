// "Open in notes" as ui sees it: the navigation itself lives in platform
// (platform/open-in-notes.ts); ui reports its failures.
import type { TaskId } from "../../domain/task/task";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Notify } from "../notify";

/**
 * Shows block `blockId` in a note panel. `from` is the plugin panel asking:
 * the block opens in the panel that opened it, or, when that one is gone, in
 * a new panel to its left; the plugin panel itself is never replaced. Without
 * `from`, it opens in the active panel. Throws when Orca opens nothing.
 */
export type OpenInNotes = (
  blockId: TaskId,
  from?: { panelId: string; originPanelId: string | undefined },
) => void;

/** `open`, with its failure told to the user. Never throws. */
export function openInNotesReporting(
  open: OpenInNotes,
  notify: Notify,
  ...args: Parameters<OpenInNotes>
): void {
  try {
    open(...args);
  } catch (error) {
    notify(
      "error",
      t("Could not open the task in the notes: ${reason}", {
        reason: describeError(error),
      }),
    );
  }
}
