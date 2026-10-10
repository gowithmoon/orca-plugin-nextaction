// Telling the user what happened (docs/ARCHITECTURE.md §4 错误处理: errors are
// caught in ui and reported with orca.notify). Verified by hand in Orca.
import {
  NoNotePanelError,
  TaskFeaturesPausedError,
} from "../application/ports/task-repository";
import {
  type ChangeStatus,
  CompletionHistoryUnreadableError,
} from "../application/usecases/change-status";
import {
  DependencyCycleError,
  type RefusedCycle,
} from "../application/usecases/dependency-cycle-error";
import { MyDayUnreadableError } from "../application/usecases/my-day-unreadable-error";
import type { TaskId, TaskStatus } from "../domain/task/task";
import { describeError } from "../shared/describe-error";
import { t } from "../shared/l10n/l10n";
import { shownText } from "./components/format";

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
  } else if (error instanceof DependencyCycleError) {
    notify("warn", refusedCycleText(error.cycle));
  } else if (error instanceof NoNotePanelError) {
    notify(
      "warn",
      t(
        "Open a journal or page first: Orca saves changes to tasks through a note panel.",
      ),
    );
  } else {
    notify("error", messages.failed(describeError(error)));
  }
}

/** Why a write was refused for making a dependency cycle (#60). */
function refusedCycleText(cycle: RefusedCycle): string {
  switch (cycle.kind) {
    case "dependencies":
      return t(
        "Not added: depending on ${tasks} would make a dependency cycle.",
        {
          tasks: cycle.targets
            .map((task) => shownText(task).text)
            .join(t(", ")),
        },
      );
    case "sequential":
      return t(
        "Sequential not switched on: ${waiting} would wait for ${waitingFor}, which already waits for it, making a dependency cycle.",
        {
          waiting: shownText(cycle.waiting).text,
          waitingFor: shownText(cycle.waitingFor).text,
        },
      );
    case "move":
      return t(
        "Not moved: there, ${moved} and ${cycleWith} would wait for each other, making a dependency cycle.",
        {
          moved: shownText(cycle.moved).text,
          cycleWith: shownText(cycle.cycleWith).text,
        },
      );
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

/**
 * Tells the user why adding to or removing from My Day failed, with the
 * shared paused notice. Shared by the task menu and the My Day view.
 */
export function notifyMyDayFailure(notify: Notify, error: unknown): void {
  if (error instanceof MyDayUnreadableError) {
    notify(
      "error",
      t(
        "Could not change My Day: this task's My Day entries cannot be read and are kept as they are.",
      ),
    );
    return;
  }
  notifyActionFailure(notify, error, (reason) =>
    t("Could not change My Day: ${reason}", { reason }),
  );
}
