// The task panel's popup shell (#35 "任务属性面板"): the form in a plugin
// window, rendered into its own React root. At most one at a time:
// opening another task replaces it. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { PluginWindow } from "../components/plugin-window";
import { TaskPanelForm, type TaskPanelFormDeps } from "./task-panel-form";

function TaskPanelPopup(props: {
  deps: TaskPanelFormDeps;
  taskId: TaskId;
  onClose: () => void;
  onSelectTask: (taskId: TaskId) => void;
}) {
  const restoreFocus = React.useRef(true);
  // The header is the form's own, shared with the side pane.
  return (
    <PluginWindow
      onClose={props.onClose}
      label={t("Task panel")}
      restoreFocus={restoreFocus}
    >
      <TaskPanelForm
        deps={props.deps}
        taskId={props.taskId}
        onClose={props.onClose}
        onSelectTask={props.onSelectTask}
        // The popup would cover the block just opened, and the focus
        // belongs with that block now.
        onOpenedInNotes={() => {
          restoreFocus.current = false;
          props.onClose();
        }}
      />
    </PluginWindow>
  );
}

/**
 * Opens task `taskId` in the popup. `onClose` hears that the popup closed by
 * itself: the user closed it, the task went away, or another opening replaced
 * it. `onSelect` hears that the user picked another task inside it (#54), and
 * is then in charge of showing that task (the plugin panel selects it, which
 * opens the popup again); without `onSelect` the popup switches to it itself,
 * keeping `onClose`. The returned function takes the popup away without
 * `onClose` (e.g. the plugin panel moving it into its side pane); it does
 * nothing once the popup is gone.
 */
export type OpenTaskPanelPopup = (
  taskId: TaskId,
  onClose?: () => void,
  onSelect?: (taskId: TaskId) => void,
) => () => void;

/**
 * The popup in `render`'s root; at most one at a time. Outside the plugin
 * panel's React tree, so "open in notes" works out the plugin panel from the
 * active panel (#39's helper).
 */
export function createTaskPanelPopup(options: {
  deps: TaskPanelFormDeps;
  render: (node: React.ReactNode) => void;
}): OpenTaskPanelPopup {
  const { deps, render } = options;
  /** Which opening is shown, so a late close of a replaced one does nothing. */
  let shown = 0;
  /** The shown opening's `onClose`, told when another opening replaces it. */
  let replaced: (() => void) | undefined;

  const open: OpenTaskPanelPopup = (taskId, onClose, onSelect) => {
    const previous = replaced;
    shown += 1;
    const mine = shown;
    replaced = onClose;
    const dismiss = () => {
      if (mine !== shown) return false;
      shown += 1;
      replaced = undefined;
      render(null);
      return true;
    };
    render(
      <TaskPanelPopup
        // A new task starts afresh: nothing typed for the previous one stays.
        key={mine}
        deps={deps}
        taskId={taskId}
        onClose={() => {
          if (dismiss()) onClose?.();
        }}
        onSelectTask={(next) => {
          if (onSelect) onSelect(next);
          // Switching is not closing: `onClose` moves to the new opening.
          else if (dismiss()) open(next, onClose);
        }}
      />,
    );
    previous?.();
    return () => {
      dismiss();
    };
  };
  return open;
}
