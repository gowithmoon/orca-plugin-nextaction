// The task panel's "why not a next action" row (#54, #78, GLOSSARY: 下一步
// 行动), shown as "阻塞原因": read only, shown only while a task to do or in
// progress is not a next action, e.g. "Subtasks not done: Write the
// introduction, Collect the data" or, passed down from an ancestor task,
// "Ancestor task Trip — Not started yet: 10/20 Tue"; the use case gives no
// reasons otherwise. Several reasons are listed with a bullet each. Each task
// name switches the task panel to that task. A recurring task holding the
// task back under a sequential parent is marked, with a hint that it keeps
// doing so until it no longer recurs (#94, ADR 0021). Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import {
  isProjectReason,
  type NotNextActionReason,
  type NotNextActionReasonsRead,
  type RelatedTask,
} from "../../application/usecases/read-not-next-action-reasons";
import type { ProjectId } from "../../domain/project/project";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import { daysBetween } from "../../domain/time/calendar-days";
import { t } from "../../shared/l10n/l10n";
import { formatDate, shownText } from "../components/format";
import { projectStatusLabel } from "../components/project-status-label";
import { Field } from "./task-panel-fields";

/**
 * What keeps the reason's source out, said of it: the task itself, or the
 * ancestor task named before it, e.g. "Subtasks not done", "Done".
 */
function predicate(reason: NotNextActionReason): string {
  switch (reason.kind) {
    case "doneAncestor":
      return t("Done");
    case "parked":
      return t("Parked");
    case "notStarted":
    case "projectNotStarted":
      return t("Not started yet");
    case "projectNotActive":
      // e.g. "Project Move house — Paused" (#143).
      return projectStatusLabel(reason.status);
    case "subtasks":
      return t("Subtasks not done");
    case "sequential":
      return t("Earlier tasks first");
    case "dependencies":
      // One of them done is enough (#58).
      return reason.mode === "any"
        ? t("Dependencies not done (any one is enough)")
        : t("Dependencies not done");
    case "cycle":
      return t("In a dependency cycle");
    case "dependencyDelay":
      return t("In dependency delay");
  }
}

/** Whether the reason goes on after its predicate: a date or tasks. */
function hasDetails(reason: NotNextActionReason): boolean {
  return (
    reason.kind === "notStarted" ||
    reason.kind === "projectNotStarted" ||
    reason.kind === "dependencyDelay" ||
    reason.waitingFor.length > 0
  );
}

/**
 * When a dependency delay lets the task in and how many days are left, after
 * the task it counts from, e.g. " was done, let in on 10/11 Sun (2 days
 * left)", worked out from `today` (#77). The release day is always after
 * today while it blocks.
 */
function releaseText(releasedOn: CalendarDate, today: CalendarDate): string {
  const date = formatDate(releasedOn, today);
  const days = daysBetween(today, releasedOn);
  return days === 1
    ? t(" was done, let in on ${date} (1 day left)", { date })
    : t(" was done, let in on ${date} (${days} days left)", {
        date,
        days: String(days),
      });
}

/**
 * A sequential reason waiting for a recurring sibling (ADR 0021): it never
 * stays done, so it keeps holding back the subtasks after it.
 */
function waitsForRecurring(
  reason: NotNextActionReason,
  tasks: ReadonlyMap<TaskId, RelatedTask>,
): boolean {
  return (
    reason.kind === "sequential" &&
    reason.waitingFor.some((id) => tasks.get(id)?.recurring)
  );
}

export function NotNextActionReasonsField(props: {
  /** The reasons as last read with the panel's relations. */
  read: NotNextActionReasonsRead;
  taskId: TaskId;
  labelId: string;
  /**
   * The current logical day, for the days a dependency delay has left and
   * how dates read.
   */
  today: CalendarDate;
  /** Switches the task panel to task `taskId`. */
  onSelectTask: (taskId: TaskId) => void;
  /** Opens project `projectId` in the notes (#143): a project is no task. */
  onOpenProject: (projectId: ProjectId) => void;
}) {
  const { reasons, tasks, projects } = props.read;
  if (reasons.length === 0) return null;
  /** A task named in a reason, as a button that switches to it. */
  const taskButton = (id: TaskId) => {
    const related = tasks.get(id);
    if (!related) return null;
    const text = shownText(related);
    return (
      <button
        type="button"
        className="nextaction-not-next-action-reason-task"
        data-empty={text.empty || undefined}
        onClick={() => props.onSelectTask(id)}
      >
        {text.text}
      </button>
    );
  };
  /** A project named in a reason, as a button that opens it in the notes. */
  const projectButton = (id: ProjectId) => {
    const related = projects.get(id);
    if (!related) return null;
    const text = shownText(related);
    return (
      <button
        type="button"
        className="nextaction-not-next-action-reason-task"
        data-empty={text.empty || undefined}
        onClick={() => props.onOpenProject(id)}
      >
        {text.text}
      </button>
    );
  };
  return (
    <Field label={t("Why not a next action")} labelId={props.labelId}>
      <ul
        className="nextaction-not-next-action-reasons"
        data-several={reasons.length > 1 || undefined}
        aria-labelledby={props.labelId}
      >
        {reasons.map((reason) => (
          <li
            key={`${reason.kind}-${reason.source}`}
            className="nextaction-not-next-action-reason"
          >
            {isProjectReason(reason) && (
              // The project the task belongs to (#143), named first as an
              // ancestor task is, e.g. "Project Move house — Paused".
              <>
                <span className="nextaction-not-next-action-reason-kind">
                  {t("Project ")}
                </span>
                {projectButton(reason.source)}
                <span className="nextaction-not-next-action-reason-kind">
                  {t(" — ")}
                </span>
              </>
            )}
            {!isProjectReason(reason) && reason.source !== props.taskId && (
              // Passed down from an ancestor task (ADR 0015, #78), named
              // first, e.g. "Ancestor task Move house — Done",
              // "Ancestor task Draft — Earlier tasks first: Outline".
              <>
                <span className="nextaction-not-next-action-reason-kind">
                  {t("Ancestor task ")}
                </span>
                {taskButton(reason.source)}
                <span className="nextaction-not-next-action-reason-kind">
                  {t(" — ")}
                </span>
              </>
            )}
            <span className="nextaction-not-next-action-reason-kind">
              {hasDetails(reason)
                ? t("${kind}: ", { kind: predicate(reason) })
                : predicate(reason)}
            </span>
            {(reason.kind === "notStarted" ||
              reason.kind === "projectNotStarted") &&
              formatDate(reason.startsOn, props.today)}
            {reason.kind === "dependencyDelay" && (
              // e.g. "In dependency delay: counting from when Paint the wall
              // was done, let in on 10/11 Sun (2 days left)".
              <span>
                {t("counting from when ")}
                {taskButton(reason.countedFrom)}
                {releaseText(reason.releasedOn, props.today)}
              </span>
            )}
            {reason.waitingFor.map((id, index) => {
              const related = tasks.get(id);
              if (!related) return null;
              const text = shownText(related);
              return (
                <span key={id}>
                  {index > 0 && t(", ")}
                  <button
                    type="button"
                    className="nextaction-not-next-action-reason-task"
                    data-empty={text.empty || undefined}
                    onClick={() => props.onSelectTask(id)}
                  >
                    {text.text}
                  </button>
                  {related.recurring && reason.kind === "sequential" && (
                    <span
                      className="nextaction-not-next-action-reason-recurring"
                      role="img"
                      aria-label={t("Recurring task")}
                    >
                      <i className="ti ti-repeat" aria-hidden="true" />
                    </span>
                  )}
                </span>
              );
            })}
            {waitsForRecurring(reason, tasks) && (
              <div className="nextaction-not-next-action-reason-hint">
                {t(
                  "A recurring task advances to its next occurrence each time it is completed, so it holds back the subtasks after it until it no longer recurs.",
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Field>
  );
}
