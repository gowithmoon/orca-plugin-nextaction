// The task menu items of step 3: the six statuses and drop (#31). Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import type { ChangeStatus } from "../../application/usecases/change-status";
import type { DropTask } from "../../application/usecases/drop-task";
import { taskStatuses } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { statusLabel } from "../components/status-label";
import { markedStatus } from "../components/status-menu";
import {
  changeStatusReporting,
  createNotify,
  notifyActionFailure,
} from "../notify";
import type { TaskMenuItems } from "./menu-items";
import { statusIcons } from "./status-icons";

/** Menu groups, lowest first. Gaps leave room for later steps. */
export const taskMenuGroups = {
  status: 10,
  myDay: 30,
  taskPanel: 50,
  drop: 100,
} as const;

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
      // An empty or unknown status marks none, so choosing inbox repairs it.
      isCurrent: (task) => markedStatus(task) === status,
      run: (task) =>
        changeStatusReporting(deps.changeStatus, notify, task.id, status),
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
        notifyActionFailure(notify, error, (reason) =>
          t("Could not drop the task: ${reason}", { reason }),
        );
      }
    },
  });
}
