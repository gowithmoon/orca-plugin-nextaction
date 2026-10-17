// The task menu's "New subtask" (#190): opens the "Create subtask" window
// for the task. Not for a done task: a subtask below a done ancestor never
// becomes a next action (ADR 0017), so it would be hard to find again.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { taskMenuGroups } from "./builtin-items";
import type { TaskMenuItems } from "./menu-items";

export function registerSubtaskMenuItem(
  items: TaskMenuItems,
  openCreateSubtask: (parent: Task) => void,
): void {
  items.register({
    id: "createSubtask",
    group: taskMenuGroups.subtask,
    order: 0,
    label: () => t("New subtask"),
    icon: "ti ti-subtask",
    isShownFor: (task) => task.status !== "done",
    async run(task) {
      openCreateSubtask(task);
    },
  });
}
