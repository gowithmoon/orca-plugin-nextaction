// The status menu (#35 "任务卡片与组件"): the six statuses, the current one
// marked. Choosing the current status does nothing. Shared by the task card
// and the task panel; render it inside a ContextMenu's `menu`. Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import { type TaskStatus, taskStatuses } from "../../domain/task/task";
import { statusIcons } from "../task-menu/status-icons";
import { statusLabel } from "./status-label";

export function StatusMenu(props: {
  /** The task's status; an empty or unknown one reads as inbox. */
  current: TaskStatus;
  /** Called with a status other than `current`, after the menu closes. */
  onChoose: (status: TaskStatus) => void;
  close: () => void;
}) {
  const { current, onChoose, close } = props;
  const { Menu, MenuText } = orca.components;
  return (
    <Menu>
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
    </Menu>
  );
}
