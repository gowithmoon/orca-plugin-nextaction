// A task in a view's list (#35 "任务卡片与组件"): its status icon, its text
// (up to three lines, selectable) and its property row. Read-only in #37;
// later tickets add the status menu, opening in the notes and the task panel.
import type { CalendarDate, Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { PropertyRow } from "./property-row";
import { StatusIcon } from "./status-icon";

export function TaskCard(props: { task: Task; today: CalendarDate }) {
  const { task, today } = props;
  const text = task.text.trim();
  return (
    <article className="nextaction-task-card">
      <div className="nextaction-task-card-status">
        <StatusIcon status={task.status} />
      </div>
      <div className="nextaction-task-card-main">
        <div
          className="nextaction-task-card-text"
          data-empty={text === "" || undefined}
        >
          {text === "" ? t("(No text)") : task.text}
        </div>
        <PropertyRow task={task} today={today} />
      </div>
    </article>
  );
}
