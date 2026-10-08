// The task menu items of step 3: the six statuses and drop (#31). Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import { TaskFeaturesPausedError } from "../../application/ports/task-repository";
import type { ChangeStatus } from "../../application/usecases/change-status";
import type { DropTask } from "../../application/usecases/drop-task";
import { type TaskStatus, taskStatuses } from "../../domain/task/task";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { TaskMenuItems } from "./menu-items";

/** Menu groups, lowest first. Gaps leave room for later steps (task panel, my day). */
export const taskMenuGroups = { status: 10, drop: 100 } as const;

/** Status names in the interface language; the note-facing names live in infra. */
const statusLabel = (status: TaskStatus): string => {
  switch (status) {
    case "inbox":
      return t("Inbox");
    case "todo":
      return t("Todo");
    case "doing":
      return t("Doing");
    case "waiting":
      return t("Waiting");
    case "someday":
      return t("Someday");
    case "done":
      return t("Done");
  }
};

/** The same tabler icons as the status icons (status-icon-style). */
const statusIcon: Record<TaskStatus, string> = {
  inbox: "ti ti-inbox",
  todo: "ti ti-circle",
  doing: "ti ti-progress",
  waiting: "ti ti-hourglass",
  someday: "ti ti-cloud",
  done: "ti ti-circle-check",
};

export type Notify = (type: "info" | "warn" | "error", message: string) => void;

/** Tells the user why an action failed. */
export function notifyFailure(
  notify: Notify,
  error: unknown,
  failed: (reason: string) => string,
): void {
  if (error instanceof TaskFeaturesPausedError) {
    notify(
      "warn",
      t(
        "Task features are paused. See the plugin's earlier notice or its task tag setting.",
      ),
    );
  } else {
    notify("error", failed(describeError(error)));
  }
}

export function registerBuiltinTaskMenuItems(
  items: TaskMenuItems,
  deps: { changeStatus: ChangeStatus; dropTask: DropTask; notify: Notify },
): void {
  taskStatuses.forEach((status, index) => {
    items.register({
      id: `status.${status}`,
      group: taskMenuGroups.status,
      order: index,
      label: () => statusLabel(status),
      icon: statusIcon[status],
      // An empty or unknown status reads as inbox, as the icon shows it.
      isCurrent: (task) => task.status === status,
      async run(task) {
        try {
          // Success says nothing: the icon changes.
          await deps.changeStatus(task.id, status);
        } catch (error) {
          notifyFailure(deps.notify, error, (reason) =>
            t("Could not change the status: ${reason}", { reason }),
          );
        }
      },
    });
  });

  items.register({
    id: "drop",
    group: taskMenuGroups.drop,
    order: 0,
    label: () => t("Drop task"),
    icon: "ti ti-trash",
    dangerous: true,
    // No confirmation: one undo brings the task back.
    async run(task) {
      try {
        await deps.dropTask(task.id);
        deps.notify("info", t("Task dropped"));
      } catch (error) {
        notifyFailure(deps.notify, error, (reason) =>
          t("Could not drop the task: ${reason}", { reason }),
        );
      }
    },
  });
}
