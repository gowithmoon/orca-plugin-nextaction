// The project details of the projects view (GLOSSARY: 项目视图, #156): a
// "‹ Projects" button back to the list, then the read-only attribute area as
// the prototype's variant C chose: the project status icon, the name and the
// progress on one line; start, due (red when overdue), "no next action" and
// a non-default importance and urgency squeezed on one line; the goal folded
// to one line, a click showing all of it; the progress bar on the area's
// bottom edge. The status icon opens the project menu, the name opens the
// project block in the notes. The tree below comes with #157. Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ProjectNode } from "../../../application/usecases/read-all-tasks";
import type { CalendarDate } from "../../../domain/task/task";
import { defaultRating } from "../../../domain/task/task";
import { compareDays } from "../../../domain/time/calendar-days";
import { t } from "../../../shared/l10n/l10n";
import {
  formatDate,
  importanceName,
  urgencyName,
} from "../../components/format";
import { ContextMenu } from "../../components/popup-controls";
import { projectStatusLabel } from "../../components/project-status-label";
import type { ProjectMenuItems } from "../../project-menu/menu-items";
import { ProjectMenu } from "../../project-menu/project-menu";
import { projectStatusIcons } from "../../project-menu/project-status-icons";
import { progressValue } from "../all-tasks/project-row";

/** The "‹ Projects" button above the attribute area. */
export function BackToProjects(props: { onBack: () => void }) {
  return (
    <button
      type="button"
      className="nextaction-project-back"
      aria-label={t("Back to projects")}
      onClick={props.onBack}
    >
      <i className="ti ti-chevron-left" aria-hidden="true" />
      {t("Projects")}
    </button>
  );
}

/** Importance or urgency, shown only off the default level. */
function RatingChip(props: {
  icon: string;
  name: string;
  label: string;
  strong: boolean;
}) {
  const { Tooltip } = orca.components;
  return (
    <Tooltip text={props.label}>
      <span
        className="nextaction-property nextaction-property-rating"
        data-strong={props.strong || undefined}
        role="img"
        aria-label={props.label}
      >
        <i className={`ti ${props.icon}`} aria-hidden="true" />
        <span aria-hidden="true">{props.name}</span>
      </span>
    </Tooltip>
  );
}

function AttributeChips(props: { node: ProjectNode; today: CalendarDate }) {
  const { node, today } = props;
  const { project } = node;
  const { Tooltip } = orca.components;
  const overdue =
    project.due !== null &&
    project.status !== "done" &&
    compareDays(project.due, today) < 0;
  const items: React.ReactNode[] = [];
  if (node.progress.kind === "noTasks") {
    items.push(
      <span key="none" className="nextaction-property">
        {t("No tasks")}
      </span>,
    );
  }
  if (node.noNextAction) {
    items.push(
      <span key="nna" className="nextaction-property nextaction-project-warn">
        <i className="ti ti-alert-triangle" aria-hidden="true" />
        {t("No next action")}
      </span>,
    );
  }
  if (project.status === "done" && node.unfinished > 0) {
    items.push(
      <span key="open" className="nextaction-property nextaction-project-warn">
        <i className="ti ti-alert-triangle" aria-hidden="true" />
        {t("${count} tasks not done yet", { count: String(node.unfinished) })}
      </span>,
    );
  }
  // The start shows whether it is reached or not (#156).
  if (project.start) {
    const date = formatDate(project.start, today);
    items.push(
      <Tooltip key="start" text={t("Start")}>
        <span
          className="nextaction-property"
          role="img"
          aria-label={`${t("Start")} ${date}`}
        >
          <i className="ti ti-calendar-event" aria-hidden="true" />
          {date}
        </span>
      </Tooltip>,
    );
  }
  if (project.due) {
    const date = formatDate(project.due, today);
    items.push(
      <Tooltip key="due" text={t("Due day")}>
        <span
          className="nextaction-property"
          data-overdue={overdue || undefined}
          role="img"
          aria-label={
            overdue
              ? `${t("Due day")} ${date} ${t("Overdue")}`
              : `${t("Due day")} ${date}`
          }
        >
          <i className="ti ti-calendar" aria-hidden="true" />
          {date}
          {overdue && (
            <span className="nextaction-property-overdue">{t("Overdue")}</span>
          )}
        </span>
      </Tooltip>,
    );
  }
  if (project.importance !== defaultRating) {
    const level = importanceName(project.importance);
    items.push(
      <RatingChip
        key="importance"
        icon="ti-flag"
        name={level}
        label={t("Importance: ${level}", { level })}
        strong={project.importance > defaultRating}
      />,
    );
  }
  if (project.urgency !== defaultRating) {
    const level = urgencyName(project.urgency);
    items.push(
      <RatingChip
        key="urgency"
        icon="ti-bolt"
        name={level}
        label={t("Urgency: ${level}", { level })}
        strong={project.urgency > defaultRating}
      />,
    );
  }
  if (items.length === 0) return null;
  return <div className="nextaction-project-attr-chips">{items}</div>;
}

/** The goal folded to one line; a click shows all of it, another folds it. */
function Goal(props: { goal: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <button
      type="button"
      className="nextaction-project-attr-goal"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <span className="nextaction-project-attr-goal-label">{t("Goal")}</span>
      <span className="nextaction-project-attr-goal-text">{props.goal}</span>
      <i
        className={open ? "ti ti-chevron-up" : "ti ti-chevron-down"}
        aria-hidden="true"
      />
    </button>
  );
}

export function ProjectAttributes(props: {
  node: ProjectNode;
  today: CalendarDate;
  /** The project menu's registrations; the status icon has no menu without them. */
  menuItems: ProjectMenuItems | undefined;
  /** Opens the project's block in a note panel. */
  onOpenInNotes: () => void;
}) {
  const { node, today, menuItems } = props;
  const { project } = node;
  const icon = projectStatusIcons[project.status];
  const status = projectStatusLabel(project.status);
  const shownProgress = progressValue(node.progress);
  const name = project.text.trim() === "" ? t("(No text)") : project.text;
  const goal = project.goal?.trim() ?? "";

  const statusIcon = (
    open?: (event: React.MouseEvent) => void,
    shown?: boolean,
  ) =>
    open ? (
      <button
        type="button"
        className="nextaction-task-card-button nextaction-project-row-status"
        style={{ color: icon.color }}
        aria-haspopup="menu"
        aria-expanded={shown}
        aria-label={t("Project status: ${status}", { status })}
        title={status}
        onClick={open}
      >
        <i className={icon.className} aria-hidden="true" />
      </button>
    ) : (
      <span
        className="nextaction-project-row-status"
        style={{ color: icon.color }}
        role="img"
        aria-label={t("Project status: ${status}", { status })}
      >
        <i className={icon.className} aria-hidden="true" />
      </span>
    );

  return (
    <section
      className="nextaction-project-attr"
      aria-label={t("Project ${name}", { name })}
    >
      <div className="nextaction-project-attr-top">
        <div className="nextaction-project-attr-line">
          {menuItems ? (
            <ContextMenu
              menu={(close) => (
                <ProjectMenu
                  items={menuItems}
                  project={project}
                  close={close}
                />
              )}
            >
              {(open, _close, shown) => statusIcon(open, shown)}
            </ContextMenu>
          ) : (
            statusIcon()
          )}
          <button
            type="button"
            className="nextaction-project-attr-name"
            title={t("Open in notes")}
            onClick={props.onOpenInNotes}
          >
            {name}
          </button>
          {shownProgress !== null && (
            <span className="nextaction-project-row-progress-value">{`${shownProgress}%`}</span>
          )}
        </div>
        <AttributeChips node={node} today={today} />
      </div>
      {goal !== "" && <Goal goal={goal} />}
      <div className="nextaction-project-attr-bar">
        {shownProgress !== null && (
          <i
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={shownProgress}
            aria-label={t("Progress")}
            style={{ width: `${shownProgress}%` }}
          />
        )}
      </div>
    </section>
  );
}
