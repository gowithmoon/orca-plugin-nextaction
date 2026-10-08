// The task menu items of step 3: the six statuses and drop (#31). Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import {
  type ChangeStatus,
  CompletionHistoryUnreadableError,
} from "../../application/usecases/change-status";
import type { DropTask } from "../../application/usecases/drop-task";
import { taskStatuses } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { statusLabel } from "../components/status-label";
import { createNotify, type Notify, notifyFailure } from "../notify";
import type { TaskMenuItems } from "./menu-items";
import { statusIcons } from "./status-icons";

/** Menu groups, lowest first. Gaps leave room for later steps (task panel, my day). */
export const taskMenuGroups = { status: 10, taskPanel: 50, drop: 100 } as const;

/** Tells the user why a task menu action failed. */
export function notifyMenuFailure(
  notify: Notify,
  error: unknown,
  failed: (reason: string) => string,
): void {
  notifyFailure(notify, error, {
    paused: t(
      "Task features are paused. See the plugin's earlier notice or its task tag setting.",
    ),
    failed,
  });
}

export function registerBuiltinTaskMenuItems(
  items: TaskMenuItems,
  deps: { changeStatus: ChangeStatus; dropTask: DropTask; pluginName: string },
): void {
  const notify = createNotify(deps.pluginName);
  // Six statuses would crowd Orca's own menus: one entry naming the current
  // status opens them.
  items.registerSubmenu(taskMenuGroups.status, {
    label: (task) =>
      t("Status: ${status}", { status: statusLabel(task.status) }),
    icon: (task) => statusIcons[task.status].className,
  });
  taskStatuses.forEach((status, index) => {
    items.register({
      id: `status.${status}`,
      group: taskMenuGroups.status,
      order: index,
      label: () => statusLabel(status),
      icon: statusIcons[status].className,
      // An empty or unknown status reads as inbox, as the icon shows it.
      isCurrent: (task) => task.status === status,
      async run(task) {
        try {
          // Success says nothing: the icon changes.
          await deps.changeStatus(task.id, status);
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
          notifyMenuFailure(notify, error, (reason) =>
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
        notify("info", t("Task dropped"));
      } catch (error) {
        notifyMenuFailure(notify, error, (reason) =>
          t("Could not drop the task: ${reason}", { reason }),
        );
      }
    },
  });
}
