// The project row of the all tasks view (GLOSSARY: 项目行, #147), as the
// prototype chose (docs/ROADMAP.md 第十一步第一阶段 "界面"): a heading, not a
// card. The first line holds the project status icon, the name in bold and
// the progress; a thin progress bar below; then, as needed, "no next action",
// "N days without progress" and "overdue" (yellow, #160), a start still
// ahead, the due date (red when overdue) and, for a done project, how many
// tasks are not done yet. The status icon and a
// right-click open the project menu; a click elsewhere activates it (the all
// tasks view collapses or expands it, the project list opens it). The review's
// projects step adds "Create task" to the first line (#162). Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
import type * as React from "react";
import type { ProjectNode } from "../../../application/usecases/read-all-tasks";
import type { ProjectProgress } from "../../../domain/project/progress";
import type { ProjectStatus } from "../../../domain/project/project";
import type { CalendarDate } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { formatDate } from "../../components/format";
import { ContextMenu } from "../../components/popup-controls";
import { projectStatusLabel } from "../../components/project-status-label";
import { selectsText } from "../../components/selects-text";
import type { ProjectMenuItems } from "../../project-menu/menu-items";
import { ProjectMenu } from "../../project-menu/project-menu";
import { projectStatusIcons } from "../../project-menu/project-status-icons";

/**
 * The progress shown, out of 100 and rounded down: 100 only when all is
 * done; `null` for no progress.
 */
export function progressValue(progress: ProjectProgress): number | null {
  if (progress.kind !== "measured") return null;
  return Math.floor((100 * progress.done) / progress.total);
}

/**
 * The project status icon: with `open`, a button opening the project menu
 * (`shown`: the menu is open); without, only the icon.
 */
export function ProjectStatusIcon(props: {
  status: ProjectStatus;
  open?: (event: React.MouseEvent) => void;
  shown?: boolean;
}) {
  const { open } = props;
  const icon = projectStatusIcons[props.status];
  const status = projectStatusLabel(props.status);
  return open ? (
    <button
      type="button"
      className="nextaction-task-card-button nextaction-project-row-status"
      style={{ color: icon.color }}
      aria-haspopup="menu"
      aria-expanded={props.shown}
      aria-label={t("Project status: ${status}", { status })}
      title={status}
      onClick={(event) => {
        // Not a click on the row around it.
        event.stopPropagation();
        open(event);
      }}
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
}

/**
 * "N days without progress" and "overdue" (GLOSSARY: 长期无进展, 逾期项目),
 * as needed, in the yellow of "no next action"; the project row and the
 * project details' attribute area share them.
 */
export function signalChips(node: ProjectNode): React.ReactNode[] {
  const items: React.ReactNode[] = [];
  if (node.noProgressDays !== null) {
    items.push(
      <span
        key="noProgress"
        className="nextaction-property nextaction-project-warn"
      >
        <i className="ti ti-clock" aria-hidden="true" />
        {t("${days} days without progress", {
          days: String(node.noProgressDays),
        })}
      </span>,
    );
  }
  if (node.overdue) {
    items.push(
      <span
        key="overdue"
        className="nextaction-property nextaction-project-warn"
      >
        <i className="ti ti-alert-triangle" aria-hidden="true" />
        {t("Overdue")}
      </span>,
    );
  }
  return items;
}

export interface ProjectRowProps {
  node: ProjectNode;
  today: CalendarDate;
  /** The project menu's registrations; the row has no menu without them. */
  menuItems: ProjectMenuItems | undefined;
  /**
   * A click on the rest of the row: the all tasks view collapses or expands
   * it, the project list opens its project details. Absent: does nothing.
   */
  onActivate?: () => void;
  /** Opens the project's block in a note panel. */
  onOpenInNotes: () => void;
  /**
   * In the done section: faded, saying how many tasks it stands for instead
   * of its progress.
   */
  inDone?: boolean;
  /**
   * One action button at the right end of the first line, before "open in
   * notes": only the review's projects step passes one ("Create task", #162).
   */
  action?: React.ReactNode;
}

function ProjectMeta(props: {
  node: ProjectNode;
  today: CalendarDate;
  inDone: boolean;
}) {
  const { node, today, inDone } = props;
  const { project } = node;
  const items: React.ReactNode[] = [];
  if (inDone) {
    items.push(
      <span key="count" className="nextaction-property">
        {t("${count} tasks", { count: String(node.taskCount) })}
      </span>,
    );
  } else if (node.progress.kind === "noTasks") {
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
  items.push(...signalChips(node));
  if (!inDone && project.status === "done" && node.unfinished > 0) {
    items.push(
      <span key="open" className="nextaction-property nextaction-project-warn">
        <i className="ti ti-alert-triangle" aria-hidden="true" />
        {t("${count} tasks not done yet", { count: String(node.unfinished) })}
      </span>,
    );
  }
  if (node.notStarted && project.start) {
    items.push(
      <span key="start" className="nextaction-property">
        <i className="ti ti-calendar-event" aria-hidden="true" />
        {t("Starts ${date}", { date: formatDate(project.start, today) })}
      </span>,
    );
  }
  if (project.due) {
    items.push(
      <span
        key="due"
        className="nextaction-property"
        data-overdue={node.overdue || undefined}
      >
        <i className="ti ti-calendar" aria-hidden="true" />
        {t("Due ${date}", { date: formatDate(project.due, today) })}
      </span>,
    );
  }
  if (items.length === 0) return null;
  return <div className="nextaction-project-row-meta">{items}</div>;
}

export function ProjectRow(props: ProjectRowProps) {
  const { node, today, menuItems, onActivate, onOpenInNotes } = props;
  const inDone = props.inDone ?? false;
  const { project } = node;
  const { Tooltip } = orca.components;
  const shownProgress = inDone ? null : progressValue(node.progress);
  const name = project.text.trim() === "" ? t("(No text)") : project.text;

  const row = (open?: (event: React.MouseEvent) => void, shown?: boolean) => (
    // Keyboard users toggle with the collapse button beside it and open the
    // menu with the status icon; a click on the row's empty space is a
    // shortcut for the pointer.
    // biome-ignore lint/a11y/useKeyWithClickEvents: see above
    <article
      className="nextaction-project-row"
      data-faded={inDone || undefined}
      aria-label={t("Project ${name}", { name })}
      onClick={
        onActivate &&
        ((event) => {
          // React bubbles clicks out of portals: a menu item chosen in the
          // menu opened from this row is not a click on the row.
          if (!(event.target instanceof Node)) return;
          if (!event.currentTarget.contains(event.target)) return;
          // A click that selected the row's text is not a click on it.
          if (!selectsText(event.currentTarget)) onActivate();
        })
      }
      onContextMenu={
        open &&
        ((event) => {
          if (!(event.target instanceof Node)) return;
          if (!event.currentTarget.contains(event.target)) return;
          open(event);
        })
      }
    >
      <div className="nextaction-project-row-line">
        <ProjectStatusIcon status={project.status} open={open} shown={shown} />
        <span className="nextaction-project-row-name" title={name}>
          {name}
        </span>
        {shownProgress !== null && (
          <span className="nextaction-project-row-progress-value">{`${shownProgress}%`}</span>
        )}
        {props.action}
        <Tooltip text={t("Open in notes")}>
          <button
            type="button"
            className="nextaction-task-card-button nextaction-task-card-open"
            aria-label={t("Open in notes")}
            onClick={(event) => {
              event.stopPropagation();
              onOpenInNotes();
            }}
          >
            <i className="ti ti-arrow-up-right" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      {shownProgress !== null && (
        <div
          className="nextaction-project-row-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shownProgress}
          aria-label={t("Progress")}
        >
          <i style={{ width: `${shownProgress}%` }} />
        </div>
      )}
      <ProjectMeta node={node} today={today} inDone={inDone} />
    </article>
  );

  if (!menuItems) return row();
  return (
    <ContextMenu
      menu={(close) => (
        <ProjectMenu items={menuItems} project={project} close={close} />
      )}
    >
      {(open, _close, shown) => row(open, shown)}
    </ContextMenu>
  );
}
