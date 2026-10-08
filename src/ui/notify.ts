// Telling the user what happened (docs/ARCHITECTURE.md §4 错误处理: errors are
// caught in ui and reported with orca.notify). Verified by hand in Orca.
import { TaskFeaturesPausedError } from "../application/ports/task-repository";
import { describeError } from "../shared/describe-error";

export type Notify = (
  type: "info" | "success" | "warn" | "error",
  message: string,
) => void;

/** Notices titled with the plugin's name. */
export function createNotify(pluginName: string): Notify {
  return (type, message) => orca.notify(type, message, { title: pluginName });
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
