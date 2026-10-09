// The task menu's "Open task panel" item (#35 "任务操作菜单的扩展"). From
// Orca's tag and block menus it always opens the popup; in the plugin panel it
// selects the task, shown in the side pane in the wide tier and in the popup
// otherwise (#42). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { taskMenuGroups } from "../task-menu/builtin-items";
import type { TaskMenuItems } from "../task-menu/menu-items";

export function registerTaskPanelMenuItem(
  items: TaskMenuItems,
  openTaskPanel: (taskId: TaskId) => void,
): void {
  items.register({
    id: "taskPanel",
    group: taskMenuGroups.taskPanel,
    order: 0,
    label: () => t("Open task panel"),
    icon: "ti ti-list-details",
    async run(task, place) {
      if (place) place.selectTask(task.id);
      else openTaskPanel(task.id);
    },
  });
}
