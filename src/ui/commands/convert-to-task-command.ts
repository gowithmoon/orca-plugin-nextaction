// The "Convert to task" editor command: runs the use case on the block at the
// cursor and tells the user what happened. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { ConvertToTaskResult } from "../../application/ports/task-repository";
import type { ConvertToTask } from "../../application/usecases/convert-to-task";
import type { EditorCommandFn } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import { createNotify, notifyFailure } from "../notify";

/** What to tell the user; success says nothing (the status icon shows it). */
function noticeFor(
  result: ConvertToTaskResult,
): { type: "info" | "warn"; message: string } | undefined {
  switch (result.kind) {
    case "converted":
      return undefined;
    case "already-task":
      return { type: "info", message: t("This block is already a task.") };
    case "not-convertible":
      return {
        type: "warn",
        message:
          result.reason === "task-tag"
            ? t("The task tag itself cannot be converted to a task.")
            : t(
                "This block cannot be converted to a task: journal blocks, and blocks with neither a parent nor an alias, cannot be tasks.",
              ),
      };
  }
}

export function createConvertToTaskCommand(
  convertToTask: ConvertToTask,
  pluginName: string,
): EditorCommandFn {
  const notify = createNotify(pluginName);

  return async ([, , cursor]) => {
    const id = cursor?.anchor.blockId;
    if (id === undefined) {
      notify("warn", t("Put the cursor in a block to convert it to a task."));
      return null;
    }
    try {
      const notice = noticeFor(await convertToTask(id));
      if (notice) notify(notice.type, notice.message);
    } catch (error) {
      notifyFailure(notify, error, {
        paused: t(
          "Task features are paused, so the block was not converted. See the plugin's earlier notice or its task tag setting.",
        ),
        failed: (reason) =>
          t("Could not convert to a task: ${reason}", { reason }),
      });
    }
    // The repository's invokeGroup is the undo unit; the command itself
    // leaves nothing for Orca to undo.
    return null;
  };
}
