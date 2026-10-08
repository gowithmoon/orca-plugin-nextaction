// The row of a task's properties under its text (#35 "任务卡片与组件"), in
// this order: an unrecognized status, due (red when overdue), start,
// contexts, labels, importance, effort. Importance and effort always show;
// the others only with a value.
import { isOverdue } from "../../domain/task/overdue";
import type { CalendarDate, DataAnomaly, Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import {
  effortName,
  formatContext,
  formatDate,
  importanceName,
} from "./format";
import { statusLabel } from "./status-label";

function anomalyText(anomaly: DataAnomaly): string {
  const { value } = anomaly;
  if (value === null || value === undefined || value === "") {
    return t("Status is empty in the notes");
  }
  return t('Unrecognized status "${value}"', {
    value: typeof value === "string" ? value : JSON.stringify(value),
  });
}

export function PropertyRow(props: {
  task: Task;
  today: CalendarDate;
  /** The task has left the view's list: its new status comes first. */
  kept?: boolean;
}) {
  const { task, today, kept } = props;
  const overdue = isOverdue(task, today);
  return (
    <div className="nextaction-property-row">
      {kept && (
        <span className="nextaction-property nextaction-property-kept">
          {t("Changed to ${status}", { status: statusLabel(task.status) })}
        </span>
      )}
      {task.anomalies.map((anomaly) => (
        <span
          key={anomaly.property}
          className="nextaction-property nextaction-property-anomaly"
        >
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          {anomalyText(anomaly)}
        </span>
      ))}
      {task.due && (
        <span
          className="nextaction-property"
          data-overdue={overdue || undefined}
        >
          {t("Due ${date}", { date: formatDate(task.due, today) })}
          {overdue && (
            <span className="nextaction-property-overdue">{t("Overdue")}</span>
          )}
        </span>
      )}
      {task.start && (
        <span className="nextaction-property">
          {t("Start ${date}", { date: formatDate(task.start, today) })}
        </span>
      )}
      {task.contexts.map((context) => (
        <span
          key={`context:${context}`}
          className="nextaction-property nextaction-property-chip"
        >
          {formatContext(context)}
        </span>
      ))}
      {task.labels.map((label) => (
        <span
          key={`label:${label}`}
          className="nextaction-property nextaction-property-chip nextaction-property-label"
        >
          {label}
        </span>
      ))}
      <span className="nextaction-property">
        {t("Importance ${level}", { level: importanceName(task.importance) })}
      </span>
      <span className="nextaction-property">
        {t("Effort ${level}", { level: effortName(task.effort) })}
      </span>
    </div>
  );
}
