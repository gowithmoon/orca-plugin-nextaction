// The gantt chart's shifting later (GLOSSARY: 顺延, #184): the notice above
// the chart after a drag left tasks after the dragged one in conflict, and
// a bar's context menu, both shifting them later on the user's click. The
// plugin never shifts on its own. The counts are the read's
// (`GanttRow.shiftCount`). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  GanttRow,
  ProjectGantt,
} from "../../../application/usecases/read-project-gantt";
import type { TaskId } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { ContextMenu } from "../../components/popup-controls";
import type { ShiftTasksLater } from "../../hooks/use-shift-later";
import type { GanttDragged } from "./gantt-bar-drag";

/** The notice's state and the drag's hooks into it. */
export interface ShiftNotice {
  /** The task the notice is for; `null` for no notice. */
  readonly task: TaskId | null;
  /** A bar starts being dragged: the notice goes. */
  readonly dragStarted: () => void;
  /** A bar's dates were written: a notice for its task. */
  readonly written: (id: TaskId) => void;
  /** Its button was used, or the tasks shifted: the notice goes. */
  readonly dismiss: () => void;
}

/**
 * The notice after a drag (#176): for the task whose dates were last
 * written by a drag, until another drag starts. Gone with the chart too:
 * another project or layout mounts a new one.
 */
export function useShiftNotice(): ShiftNotice {
  const [task, setTask] = React.useState<TaskId | null>(null);
  // Stable, so the drag's callbacks need not change with the notice.
  const hide = React.useCallback(() => setTask(null), []);
  const show = React.useCallback((id: TaskId) => setTask(id), []);
  return React.useMemo(
    () => ({ task, dragStarted: hide, written: show, dismiss: hide }),
    [task, hide, show],
  );
}

/**
 * The notice above the chart: "N tasks after it conflict with its dates
 * [Shift N tasks later]", N by the chart read since the write. Nothing
 * while the bar still shows its dropped dates unread (the count would be
 * the old one), or when N is 0.
 */
export function GanttShiftNotice(props: {
  gantt: ProjectGantt;
  notice: ShiftNotice;
  dragged: GanttDragged | null;
  shiftLater: ShiftTasksLater;
}) {
  const { gantt, notice, dragged, shiftLater } = props;
  const { Button } = orca.components;
  const id = notice.task;
  if (id === null) return null;
  if (dragged?.id === id && dragged.settled) return null;
  const count = gantt.rows.find((row) => row.task.id === id)?.shiftCount ?? 0;
  if (count === 0) return null;
  return (
    <div className="nextaction-gantt-shift-notice" role="status">
      <i className="ti ti-alert-triangle" aria-hidden="true" />
      <span className="nextaction-gantt-shift-notice-text">
        {t("${count} tasks after it conflict with its dates", {
          count: String(count),
        })}
      </span>
      <Button
        variant="outline"
        onClick={() => {
          notice.dismiss();
          void shiftLater(id);
        }}
      >
        {t("Shift ${count} tasks later", { count: String(count) })}
      </Button>
    </div>
  );
}

/**
 * A bar's context menu (#176): "Shift later tasks" with the count, disabled
 * when none conflicts. `children` draws the bar, opening the menu on a
 * right-click.
 */
export function GanttBarMenu(props: {
  row: GanttRow;
  shiftLater: ShiftTasksLater;
  children: (
    onContextMenu: ((event: React.MouseEvent) => void) | undefined,
  ) => React.ReactNode;
}) {
  const { row, shiftLater, children } = props;
  // A bracket never shifts from its own dates: it has none.
  if (row.bar.kind !== "bar") return <>{children(undefined)}</>;
  const { MenuText } = orca.components;
  const count = row.shiftCount;
  return (
    <ContextMenu
      menu={(close) => (
        <MenuText
          title={t("Shift later tasks (${count})", { count: String(count) })}
          preIcon="ti ti-arrow-bar-to-right"
          disabled={count === 0}
          onClick={() => {
            close();
            if (count > 0) void shiftLater(row.task.id);
          }}
        />
      )}
    >
      {(open) =>
        children((event) => {
          event.preventDefault();
          open(event);
        })
      }
    </ContextMenu>
  );
}
