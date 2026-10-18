// The task menu's "Split into subtasks" (#202): opens the window that asks
// the AI for a draft. Not for a done task, as "New subtask": a subtask below
// a done ancestor never becomes a next action (ADR 0017). Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import type { Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { taskMenuGroups } from "./builtin-items";
import type { TaskMenuItems } from "./menu-items";

export function registerSplitMenuItem(
  items: TaskMenuItems,
  openSplitSubtasks: (parent: Task) => void,
): void {
  items.register({
    id: "splitSubtasks",
    group: taskMenuGroups.subtask,
    // After "New subtask".
    order: 10,
    label: () => t("Split into subtasks"),
    icon: "ti ti-sparkles",
    isShownFor: (task) => task.status !== "done",
    async run(task) {
      openSplitSubtasks(task);
    },
  });
}
