// A task in a view's list (#35 "任务卡片与组件"): its status icon, its text
// (up to three lines, selectable) and its property row. Read-only in #37;
// later tickets add the status menu, opening in the notes and the task panel.
import type { CalendarDate, Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { PropertyRow } from "./property-row";
import { StatusIcon } from "./status-icon";

export function TaskCard(props: {
  task: Task;
  today: CalendarDate;
  /** Clicking the card opens the task (the task panel, #40). */
  onOpen?: (task: Task) => void;
}) {
  const { task, today, onOpen } = props;
  const text = task.text.trim();
  const open = onOpen && (() => onOpen(task));
  return (
    <article
      className="nextaction-task-card"
      data-openable={open ? true : undefined}
      // Reachable by keyboard when it opens: Enter or Space opens it.
      tabIndex={open ? 0 : undefined}
      onClick={
        open &&
        (() => {
          // Selecting text to copy it is not a click on the card.
          if (window.getSelection()?.isCollapsed === false) return;
          open();
        })
      }
      onKeyDown={
        open &&
        ((e) => {
          // Only the card itself: keys on controls inside it are theirs.
          if (e.target !== e.currentTarget) return;
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          open();
        })
      }
    >
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
