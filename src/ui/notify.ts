// Telling the user what happened (docs/ARCHITECTURE.md §4 错误处理: errors are
// caught in ui and reported with orca.notify). Verified by hand in Orca.
import { TaskFeaturesPausedError } from "../application/ports/task-repository";
import {
  type ChangeStatus,
  CompletionHistoryUnreadableError,
} from "../application/usecases/change-status";
import type { TaskId, TaskStatus } from "../domain/task/task";
import { describeError } from "../shared/describe-error";
import { t } from "../shared/l10n/l10n";

export type Notify = (
  type: "info" | "success" | "warn" | "error",
  message: string,
) => void;

/** Notices titled with the plugin's name. */
export function createNotify(pluginName: string): Notify {
  return (type, message) => orca.notify(type, message, { title: pluginName });
}

/** What the user is told while task features are paused. */
export function pausedText(): string {
  return t(
    "Task features are paused. See the plugin's earlier notice or its task tag setting.",
  );
}

/**
 * Tells the user why an action failed: a warning with `paused` while task
 * features are paused, otherwise an error with `failed(reason)`.
 */
export function notifyFailure(
  notify: Notify,
  error: unknown,
  messages: { paused: string; failed: (reason: string) => string },
): void {
  if (error instanceof TaskFeaturesPausedError) {
    notify("warn", messages.paused);
  } else {
    notify("error", messages.failed(describeError(error)));
  }
}

/**
 * Tells the user why an action on a task failed (the task menu, the plugin
 * panel, the task panel), with the shared paused notice.
 */
export function notifyActionFailure(
  notify: Notify,
  error: unknown,
  failed: (reason: string) => string,
): void {
  notifyFailure(notify, error, { paused: pausedText(), failed });
}

/**
 * Changes the status and reports a failure; success says nothing (the icon
 * changes). Never throws. Shared by the task menu, the task card and the
 * task panel.
 */
export async function changeStatusReporting(
  changeStatus: ChangeStatus,
  notify: Notify,
  id: TaskId,
  status: TaskStatus,
): Promise<void> {
  try {
    await changeStatus(id, status);
  } catch (error) {
    if (error instanceof CompletionHistoryUnreadableError) {
      notify(
        "error",
        t(
          "Could not mark the task done: its completion history cannot be read and is kept as it is.",
        ),
      );
      return;
    }
    notifyActionFailure(notify, error, (reason) =>
      t("Could not change the status: ${reason}", { reason }),
    );
  }
}
