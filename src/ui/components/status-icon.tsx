// A task's status icon (GLOSSARY: 状态图标) in the plugin panel: the same
// icon table and colours as the status icon in the notes.
import type { TaskStatus } from "../../domain/task/task";
import { statusIcons } from "../task-menu/status-icons";
import { statusLabel } from "./status-label";

export function StatusIcon(props: { status: TaskStatus }) {
  const icon = statusIcons[props.status];
  return (
    <span
      className="nextaction-status-icon"
      role="img"
      aria-label={statusLabel(props.status)}
      style={{ color: icon.color }}
    >
      <i className={icon.className} aria-hidden="true" />
    </span>
  );
}
