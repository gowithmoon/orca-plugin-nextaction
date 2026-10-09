// Task actions for components in the plugin panel and the task panel: change
// the status, open in the notes. Failures are told to the user; success of a
// status change says nothing (the icon changes). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ChangeStatus } from "../../application/usecases/change-status";
import type { Task, TaskStatus } from "../../domain/task/task";
import { changeStatusReporting, type Notify } from "../notify";
import { type OpenInNotes, openInNotesReporting } from "../panel/open-in-notes";
import { PanelContext } from "../panel/panel-context";

export interface TaskActionsDeps {
  changeStatus: ChangeStatus;
  openInNotes: OpenInNotes;
  notify: Notify;
}

export interface TaskActions {
  /** Changes to `status`; the status menu never offers the current one. */
  changeStatus(task: Task, status: TaskStatus): void;
  /** Opens the task's block in a note panel, never in the plugin panel. */
  openInNotes(task: Task): void;
}

export function useTaskActions(deps: TaskActionsDeps): TaskActions {
  // Absent outside the plugin panel (e.g. a popup in its own React root).
  const panel = React.useContext(PanelContext);
  const panelId = panel?.panelId;
  const originPanelId = panel?.originPanelId;
  const openedInNotes = panel?.openedInNotes;
  return React.useMemo(
    () => ({
      changeStatus(task, status) {
        void changeStatusReporting(
          deps.changeStatus,
          deps.notify,
          task.id,
          status,
        );
      },
      openInNotes(task) {
        openInNotesReporting(
          deps.openInNotes,
          deps.notify,
          task.id,
          panelId === undefined ? undefined : { panelId, originPanelId },
        );
        openedInNotes?.();
      },
    }),
    [deps, panelId, originPanelId, openedInNotes],
  );
}
