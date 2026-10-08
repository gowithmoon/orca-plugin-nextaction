// The task panel's popup shell (#35 "任务属性面板"): the form in Orca's
// ModalOverlay, rendered into its own React root. At most one at a time:
// opening another task replaces it. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type * as React from "react";
import type { TaskId } from "../../domain/task/task";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import { createNotify } from "../notify";
import { TaskPanelForm, type TaskPanelFormDeps } from "./task-panel-form";

/** Where "Open in notes" opens the block; the plugin panel passes its origin. */
export interface OpenFrom {
  readonly originPanelId?: string;
}

function TaskPanelPopup(props: {
  deps: TaskPanelFormDeps;
  taskId: TaskId;
  onClose: () => void;
  onOpenInNotes: (taskId: TaskId) => void;
}) {
  const { ModalOverlay } = orca.components;
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Whether ModalOverlay closes on Esc by itself is not measured; a key a
    // control inside already handled (e.g. a picker closing) is left alone.
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (e.nativeEvent.isComposing) return;
    // Keys from a picker rendered elsewhere in the page (a portal) still
    // bubble here through React: Esc there closes the picker, not the popup.
    if (!e.currentTarget.contains(e.target as Node)) return;
    e.preventDefault();
    props.onClose();
  };
  // Always visible while mounted: closing unmounts it at once (as quick
  // capture does), so opening again is never held up by `onClosed`.
  return (
    <ModalOverlay visible={true} canClose={true} onClose={props.onClose}>
      <div
        className="nextaction-task-panel-popup"
        role="dialog"
        aria-modal="true"
        aria-label={t("Task panel")}
        onKeyDown={onKeyDown}
      >
        <TaskPanelForm
          deps={props.deps}
          taskId={props.taskId}
          onClose={props.onClose}
          onOpenInNotes={props.onOpenInNotes}
        />
      </div>
    </ModalOverlay>
  );
}

/**
 * Opens task `taskId` in the popup, in `render`'s root; another one already
 * open is replaced. "Open in notes" opens the block with `openInNotes`, then
 * closes the popup, which would cover it.
 */
export function createTaskPanelPopup(options: {
  deps: TaskPanelFormDeps;
  render: (node: React.ReactNode) => void;
  openInNotes: (blockId: number, originPanelId?: string) => void;
}): (taskId: TaskId, from?: OpenFrom) => void {
  const { deps, render } = options;
  const notify = createNotify(deps.pluginName);
  /** Which opening is shown, so a late close of a replaced one does nothing. */
  let shown = 0;

  return (taskId, from = {}) => {
    shown += 1;
    const mine = shown;
    const close = () => {
      if (mine !== shown) return;
      shown += 1;
      render(null);
    };
    const openInNotes = (id: TaskId) => {
      try {
        options.openInNotes(id, from.originPanelId);
        close();
      } catch (error) {
        notify(
          "error",
          t("Could not open the task in the notes: ${reason}", {
            reason: describeError(error),
          }),
        );
      }
    };
    render(
      <TaskPanelPopup
        // A new task starts afresh: nothing typed for the previous one stays.
        key={mine}
        deps={deps}
        taskId={taskId}
        onClose={close}
        onOpenInNotes={openInNotes}
      />,
    );
  };
}
