// The task panel's side pane shell (#35 "任务属性面板", #42): the form in the
// plugin panel's side pane, in the wide tier. Without a selected task it says
// what the pane is for; it never selects one by itself. Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import type * as React from "react";
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { TaskPanelForm, type TaskPanelFormDeps } from "./task-panel-form";

export interface TaskPanelSidePaneProps {
  /** The selected task; `undefined` shows the hint. */
  taskId: TaskId | undefined;
  /** The task went away or the user closed it: nothing is selected any more. */
  onClose: () => void;
  /** The user picked another task from inside the form: select it. */
  onSelectTask: (taskId: TaskId) => void;
}

/** The side pane, showing the form with `deps`. */
export function createTaskPanelSidePane(
  deps: TaskPanelFormDeps,
): React.ComponentType<TaskPanelSidePaneProps> {
  return function TaskPanelSidePane(props) {
    if (props.taskId === undefined) {
      return (
        <div className="nextaction-view-notice" role="status">
          <i className="ti ti-list-details" aria-hidden="true" />
          <div className="nextaction-view-notice-detail">
            {t("Pick a task to see and edit its properties here")}
          </div>
        </div>
      );
    }
    return (
      <TaskPanelForm
        // A new task starts afresh: nothing typed for the previous one stays.
        key={props.taskId}
        deps={deps}
        taskId={props.taskId}
        onClose={props.onClose}
        onSelectTask={props.onSelectTask}
      />
    );
  };
}
