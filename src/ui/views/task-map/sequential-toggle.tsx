// The sequential switch on a parent task's box head (#220, GLOSSARY: 顺序执行):
// a toggle button among the head card's buttons, pressed while sequential
// is on. Switching on is refused for making a dependency cycle, told as in
// the task panel (task-map-edits.tsx). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { Task } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { useTaskMapEdits } from "./task-map-edits";

export function SequentialToggle(props: { task: Task }) {
  const { task } = props;
  const edits = useTaskMapEdits();
  const { Tooltip } = orca.components;
  const [busy, setBusy] = React.useState(false);
  if (!edits) return null;
  return (
    <Tooltip text={t("Subtasks one at a time, in note order")}>
      <button
        type="button"
        className="nextaction-task-card-button nextaction-task-card-extra nextaction-task-map-sequential"
        data-on={task.sequential || undefined}
        aria-pressed={task.sequential}
        aria-label={t("Sequential")}
        disabled={busy}
        onClick={(event) => {
          // Not a click on the card: that opens the task panel.
          event.stopPropagation();
          setBusy(true);
          void edits
            .setSequential(task.id, !task.sequential)
            .finally(() => setBusy(false));
        }}
      >
        <i className="ti ti-list-numbers" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
