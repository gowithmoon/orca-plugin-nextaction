// The task menu's "Show in task map" (#221): switches the plugin panel to the
// task map, opening the panel first when it is closed, and shows the task
// there: selected and centered, its boxes expanded and the filter relaxed for
// now. For every task: the map shows any, done ones and ones with no
// relation once relaxed. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { createNotify, notifyActionFailure } from "../notify";
import { taskMenuGroups } from "./builtin-items";
import type { TaskMenuItems } from "./menu-items";

export function registerTaskMapMenuItem(
  items: TaskMenuItems,
  deps: {
    /** Shows the task on the task map; rejects when it cannot. */
    showInTaskMap: (taskId: TaskId) => Promise<void>;
    pluginName: string;
  },
): void {
  const notify = createNotify(deps.pluginName);
  items.register({
    id: "taskMap",
    group: taskMenuGroups.taskPanel,
    // After "Open task panel".
    order: 10,
    label: () => t("Show in task map"),
    icon: "ti ti-sitemap",
    async run(task) {
      try {
        await deps.showInTaskMap(task.id);
      } catch (error) {
        notifyActionFailure(notify, error, (reason) =>
          t("Could not show the task in the task map: ${reason}", { reason }),
        );
      }
    },
  });
}
