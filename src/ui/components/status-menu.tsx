// The status menu (#35 "任务卡片与组件"): the six statuses, the current one
// marked. Choosing the current status does nothing. Shared by the task card
// and the task panel; render it as a ContextMenu's `menu`, which is already a
// menu: an `orca.components.Menu` around it draws a second background and
// shadow. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import {
  hasStatusAnomaly,
  type Task,
  type TaskStatus,
  taskStatuses,
} from "../../domain/task/task";
import { statusIcons } from "../task-menu/status-icons";
import { statusLabel } from "./status-label";

/**
 * The status to mark as current: none while the notes hold an empty or
 * unknown status, so choosing inbox writes it and repairs the task.
 */
export function markedStatus(task: Task): TaskStatus | undefined {
  return hasStatusAnomaly(task) ? undefined : task.status;
}

export function StatusMenu(props: {
  /** The status marked as current (`markedStatus`); none is marked without it. */
  current: TaskStatus | undefined;
  /** Called with a status other than `current`, after the menu closes. */
  onChoose: (status: TaskStatus) => void;
  close: () => void;
}) {
  const { current, onChoose, close } = props;
  const { MenuText } = orca.components;
  return (
    <>
      {taskStatuses.map((status) => {
        const isCurrent = status === current;
        return (
          <MenuText
            key={status}
            title={statusLabel(status)}
            preIcon={statusIcons[status].className}
            postIcon={isCurrent ? "ti ti-check" : undefined}
            aria-current={isCurrent || undefined}
            onClick={() => {
              close();
              if (!isCurrent) onChoose(status);
            }}
          />
        );
      })}
    </>
  );
}
