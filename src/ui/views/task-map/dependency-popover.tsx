// The dependency badge at a dependent's entry on the task map and its
// popover (#220): the badge shows "Any" and "+N days" (dependency-badge.ts);
// a click opens a small popover in the plugin panel's popup layer editing
// the dependency mode (with two dependencies or more, as the task panel)
// and the dependency delay, the task's own. Each change is one undo; the
// map reads again on the change signal. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { TaskMapNode } from "../../../application/usecases/read-task-map";
import { t } from "../../../shared/l10n/l10n";
import { ContextMenu } from "../../components/popup-controls";
import {
  DependencyDelayField,
  DependencyModeField,
} from "../../task-panel/task-panel-fields";
import type { DependencyBadge as Badge } from "./dependency-badge";
import { type TaskMapEdits, useTaskMapEdits } from "./task-map-edits";

/**
 * Keeps the canvas from hearing presses and keys in the popover: React
 * bubbles them out of the portal, where a press would pan and Space or F
 * would be taken. Esc goes on, for the popover to close.
 */
const keepFromCanvas = {
  onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
  onKeyDown: (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") event.stopPropagation();
  },
};

function DependencyPopover(props: { node: TaskMapNode; edits: TaskMapEdits }) {
  const { node, edits } = props;
  const { task } = node;
  const idPrefix = React.useId();
  const id = (field: string) => `${idPrefix}-${field}`;
  return (
    <div className="nextaction-task-map-dependency-popover" {...keepFromCanvas}>
      {task.dependencies.length >= 2 && (
        <div className="nextaction-task-map-dependency-field">
          <div id={id("mode")} className="nextaction-task-map-dependency-label">
            {t("Dependency mode")}
          </div>
          <DependencyModeField
            labelId={id("mode")}
            mode={task.dependencyMode}
            onChange={(mode) => edits.setDependencyMode(task.id, mode)}
          />
        </div>
      )}
      <div className="nextaction-task-map-dependency-field">
        <div id={id("delay")} className="nextaction-task-map-dependency-label">
          {t("Dependency delay")}
        </div>
        <DependencyDelayField
          labelId={id("delay")}
          days={task.dependencyDelay}
          onSave={(days) => void edits.setDependencyDelay(task.id, days)}
        />
      </div>
    </div>
  );
}

/** The badge, opening the popover; nothing outside the task map. */
export function DependencyBadgeButton(props: {
  node: TaskMapNode;
  badge: Badge;
}) {
  const { node, badge } = props;
  const edits = useTaskMapEdits();
  if (!edits) return null;
  const label = t("Dependency mode and delay");
  return (
    <ContextMenu
      keyboardNav={false}
      clickToClose={false}
      escapeToClose
      menu={() => <DependencyPopover node={node} edits={edits} />}
    >
      {(open, _close, shown) => (
        <button
          type="button"
          className="nextaction-task-map-badge"
          data-quiet={badge.quiet || undefined}
          data-open={shown || undefined}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={shown}
          title={label}
          onClick={(event) => {
            event.stopPropagation();
            open(event);
          }}
        >
          {badge.quiet && <i className="ti ti-link" aria-hidden="true" />}
          {badge.any && <span>{t("Any")}</span>}
          {badge.delay > 0 && (
            <span>{t("+${days}d", { days: String(badge.delay) })}</span>
          )}
        </button>
      )}
    </ContextMenu>
  );
}
