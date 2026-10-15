// The project menu items of #144: the five project statuses. Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).

import type { ChangeProjectStatus } from "../../application/usecases/change-project-status";
import { NotAProjectError } from "../../application/usecases/change-project-status";
import { projectStatuses } from "../../domain/project/project";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import { projectStatusLabel } from "../components/project-status-label";
import { createNotify, type Notify } from "../notify";
import type { ProjectMenuItems } from "./menu-items";
import { projectStatusIcons } from "./project-status-icons";

/** Menu groups, lowest first. Gaps leave room for later steps. */
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
