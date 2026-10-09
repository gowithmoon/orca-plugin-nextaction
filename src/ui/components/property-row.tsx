// The row of a task's properties under its text (#45 "任务卡片的属性行", which
// changes two rules of #35), in this order: the new status of a task that left
// the view, an unrecognized status, due (red with "overdue" when overdue),
// contexts, labels, importance, effort. The start date never shows on a card.
// Importance and effort always show, as an icon and the level's name: faded at
// the default, importance bold from "high" up, the full wording as tooltip and
// accessible name. The others only show with a value. Items are told apart by
// spacing and their own icon or background, not separators.
import { isOverdue } from "../../domain/task/overdue";
import type {
  CalendarDate,
  DataAnomaly,
  Rating,
  Task,
} from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import {
  effortName,
  formatContext,
  formatDate,
  importanceName,
} from "./format";
import { statusLabel } from "./status-label";

const defaultRating: Rating = 4;

function anomalyText(anomaly: DataAnomaly): string {
  const { value } = anomaly;
  if (value === null || value === undefined || value === "") {
    return t("Status is empty in the notes");
  }
  return t('Unrecognized status "${value}"', {
    value: typeof value === "string" ? value : JSON.stringify(value),
  });
}

/** Importance or effort: an icon and the level's name, the full wording on hover. */
function RatingProperty(props: {
  icon: string;
  name: string;
  /** The full wording, e.g. "重要性：一般". */
  label: string;
  level: Rating;
  strong?: boolean;
}) {
  const { icon, name, label, level, strong } = props;
  const { Tooltip } = orca.components;
  return (
    <Tooltip text={label}>
      <span
        className="nextaction-property nextaction-property-rating"
        data-default={level === defaultRating || undefined}
        data-strong={strong || undefined}
        role="img"
        aria-label={label}
      >
        <i className={`ti ${icon}`} aria-hidden="true" />
        <span aria-hidden="true">{name}</span>
      </span>
    </Tooltip>
  );
}

export function PropertyRow(props: {
  task: Task;
  today: CalendarDate;
  /** The task has left the view's list: its new status comes first. */
  kept?: boolean;
}) {
  const { task, today, kept } = props;
  const overdue = isOverdue(task, today);
  const importance = importanceName(task.importance);
  const effort = effortName(task.effort);
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
          className="nextaction-property nextaction-property-due"
          data-overdue={overdue || undefined}
        >
          <i className="ti ti-calendar" aria-hidden="true" />
          {t("Due ${date}", { date: formatDate(task.due, today) })}
          {overdue && (
            <span className="nextaction-property-overdue">{t("Overdue")}</span>
          )}
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
      <RatingProperty
        icon="ti-flag"
        name={importance}
        label={t("Importance: ${level}", { level: importance })}
        level={task.importance}
        strong={task.importance > defaultRating}
      />
      <RatingProperty
        icon="ti-weight"
        name={effort}
        label={t("Effort: ${level}", { level: effort })}
        level={task.effort}
      />
    </div>
  );
}
