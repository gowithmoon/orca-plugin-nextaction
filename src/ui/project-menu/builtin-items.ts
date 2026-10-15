// The project menu items of #144: the five project statuses. Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).

import type { ChangeProjectStatus } from "../../application/usecases/change-project-status";
import { NotAProjectError } from "../../application/usecases/change-project-status";
import type {
  DropProject,
  ReadDropProjectPlan,
} from "../../application/usecases/drop-project";
import { projectStatuses } from "../../domain/project/project";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import { projectStatusLabel } from "../components/project-status-label";
import { createNotify, type Notify } from "../notify";
import type { ProjectMenuItems } from "./menu-items";
import { projectStatusIcons } from "./project-status-icons";

/** Menu groups, lowest first. */
export const projectMenuGroups = {
  status: 10,
  /** "Drop project" (#150). */
  drop: 100,
} as const;

/**
 * Tells the user why an action on a project failed (the project menu, the
 * project row): the block is no longer a project, or anything else as an
 * error with `failed(reason)`.
 */
export function notifyProjectActionFailure(
  notify: Notify,
  error: unknown,
  failed: (reason: string) => string,
): void {
  if (error instanceof NotAProjectError) {
    notify("warn", t("Nothing changed: the block is no longer a project."));
    return;
  }
  notify("error", failed(describeError(error)));
}

/**
 * "Drop project" (GLOSSARY: 放弃项目, #150): asks with Orca's `ConfirmBox`
 * when open tasks go with it, naming how many; drops it at once when none
 * do. One undo brings everything back.
 */
export function registerDropProjectItem(
  items: ProjectMenuItems,
  deps: {
    readDropProjectPlan: ReadDropProjectPlan;
    dropProject: DropProject;
    pluginName: string;
  },
): void {
  const notify = createNotify(deps.pluginName);
  items.register({
    id: "dropProject",
    group: projectMenuGroups.drop,
    order: 0,
    label: () => t("Drop project"),
    icon: "ti ti-trash",
    dangerous: true,
    async confirmation(project) {
      try {
        const plan = await deps.readDropProjectPlan(project.id);
        if (plan.openTasks === 0) return null;
        return t(
          'Drop project "${name}"? Its ${count} open tasks will be dropped too; done tasks are kept. You can undo it.',
          { name: plan.project.text, count: String(plan.openTasks) },
        );
      } catch (error) {
        notifyProjectActionFailure(notify, error, (reason) =>
          t("Could not drop the project: ${reason}", { reason }),
        );
        throw error;
      }
    },
    async run(project) {
      try {
        // The tasks are worked out again: the plan may be stale by now.
        await deps.dropProject(project.id);
        notify("info", t("Project dropped"));
      } catch (error) {
        notifyProjectActionFailure(notify, error, (reason) =>
          t("Could not drop the project: ${reason}", { reason }),
        );
      }
    },
  });
}

export function registerBuiltinProjectMenuItems(
  items: ProjectMenuItems,
  deps: { changeProjectStatus: ChangeProjectStatus; pluginName: string },
): void {
  const notify = createNotify(deps.pluginName);
  // As the task menu's statuses: one entry naming the current project
  // status opens the five.
  items.registerSubmenu(projectMenuGroups.status, {
    label: (project) =>
      t("Project status: ${status}", {
        status: projectStatusLabel(project.status),
      }),
    icon: (project) => projectStatusIcons[project.status].className,
  });
  projectStatuses.forEach((status, index) => {
    items.register({
      id: `projectStatus.${status}`,
      group: projectMenuGroups.status,
      order: index,
      label: () => projectStatusLabel(status),
      icon: projectStatusIcons[status].className,
      isCurrent: (project) => project.status === status,
      // Success says nothing: the icon changes. Done leaves the tasks as
      // they are (GLOSSARY: 项目状态).
      async run(project) {
        try {
          await deps.changeProjectStatus(project.id, status);
        } catch (error) {
          notifyProjectActionFailure(notify, error, (reason) =>
            t("Could not change the project status: ${reason}", { reason }),
          );
        }
      },
    });
  });
}
