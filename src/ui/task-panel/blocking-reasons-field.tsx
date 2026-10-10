// The task panel's "why not a next action" row (#54, #78, GLOSSARY: 下一步
// 行动): read only, shown only while a task to do or in progress is not a
// next action, e.g. "Subtasks: Write the introduction, Collect the data" or
// "Not started yet: Trip starts on 10/20 Tue"; the use case gives no reasons
// otherwise. Each task name switches the task panel to that task. Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import type {
  NotNextActionReason,
  ReadBlockingReasons,
} from "../../application/usecases/read-blocking-reasons";
import type { BlockingReason } from "../../domain/blocking/task-graph";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import { daysBetween } from "../../domain/time/calendar-days";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { t } from "../../shared/l10n/l10n";
import { formatDate, shownText } from "../components/format";
import { useBlockingReasons } from "../hooks/use-blocking-reasons";
import type { Notify } from "../notify";
import { Field } from "./task-panel-fields";

/** What a reason of this kind is called before the tasks it names. */
function kindLabel(reason: NotNextActionReason): string {
  switch (reason.kind) {
    case "doneAncestor":
      return t("Ancestor task done");
    case "parked":
      return t("In a parked subtree");
    case "notStarted":
      return t("Not started yet");
    case "subtasks":
      return t("Subtasks");
    case "sequential":
      return t("Sequential");
    case "dependencies":
      return t("Dependencies");
    case "cycle":
      return t("Dependency cycle");
    case "dependencyDelay":
      return t("In dependency delay");
  }
}

/**
 * When a dependency delay lets the task in and how many days are left, e.g.
 * "let in on 10/11 Sun (2 days left), counting from when ", worked out from
 * `today` (#77). The release day is always after today while it blocks.
 */
function releaseText(releasedOn: CalendarDate, today: CalendarDate): string {
  const date = formatDate(releasedOn, today);
  const days = daysBetween(today, releasedOn);
  return days === 1
    ? t("let in on ${date} (1 day left), counting from when ", { date })
    : t("let in on ${date} (${days} days left), counting from when ", {
        date,
        days: String(days),
      });
}

/**
 * A reason that is not blocking (#78): its source is the task it names, so
 * it reads "Kind: Source …", never "Kind (from Source): …".
 */
function namesSource(
  reason: NotNextActionReason,
): reason is Exclude<NotNextActionReason, BlockingReason> {
  return (
    reason.kind === "doneAncestor" ||
    reason.kind === "parked" ||
    reason.kind === "notStarted"
  );
}

/** Dependencies in mode "any": waiting for one of them, not all. */
function anyMode(reason: NotNextActionReason): boolean {
  return reason.kind === "dependencies" && reason.mode === "any";
}

export function BlockingReasonsField(props: {
  readBlockingReasons: ReadBlockingReasons;
  taskId: TaskId;
  changes: ChangeSignalSource;
  notify: Notify;
  labelId: string;
  /**
   * The current logical day, for the days a dependency delay has left and
   * how dates read.
   */
  today: CalendarDate;
  /** Switches the task panel to task `taskId`. */
  onSelectTask: (taskId: TaskId) => void;
}) {
  const { reasons, tasks } = useBlockingReasons(
    props.readBlockingReasons,
    props.taskId,
    props.changes,
    props.notify,
  );
  if (reasons.length === 0) return null;
  /** A task named in a reason, as a button that switches to it. */
  const taskButton = (id: TaskId) => {
    const related = tasks.get(id);
    if (!related) return null;
    const text = shownText(related);
    return (
      <button
        type="button"
        className="nextaction-blocking-reason-task"
        data-empty={text.empty || undefined}
        onClick={() => props.onSelectTask(id)}
      >
        {text.text}
      </button>
    );
  };
  return (
    <Field label={t("Why not a next action")} labelId={props.labelId}>
      <ul
        className="nextaction-blocking-reasons"
        aria-labelledby={props.labelId}
      >
        {reasons.map((reason) => (
          <li
            key={`${reason.kind}-${reason.source}`}
            className="nextaction-blocking-reason"
          >
            {namesSource(reason) ? (
              // Not blocking (#78), e.g. "Ancestor task done: Move house",
              // "In a parked subtree: Find a teacher", "Not started yet:
              // Trip starts on 10/20 Tue" (the task itself or an ancestor).
              <>
                <span className="nextaction-blocking-reason-kind">
                  {t("${kind}: ", { kind: kindLabel(reason) })}
                </span>
                {taskButton(reason.source)}
                {reason.kind === "notStarted" &&
                  t(" starts on ${date}", {
                    date: formatDate(reason.startsOn, props.today),
                  })}
              </>
            ) : reason.source === props.taskId ? (
              <span className="nextaction-blocking-reason-kind">
                {anyMode(reason)
                  ? // One of them done is enough (#58), e.g.
                    // "Dependencies (any): Book, Pack".
                    t("${kind} (any): ", { kind: kindLabel(reason) })
                  : t("${kind}: ", { kind: kindLabel(reason) })}
              </span>
            ) : (
              // Passed down from an ancestor task (ADR 0015), e.g.
              // "Sequential (from Draft): Outline",
              // "Dependencies (any, from Trip): Book".
              <span className="nextaction-blocking-reason-kind">
                {anyMode(reason)
                  ? t("${kind} (any, from ", { kind: kindLabel(reason) })
                  : t("${kind} (from ", { kind: kindLabel(reason) })}
                {taskButton(reason.source)}
                {t("): ")}
              </span>
            )}
            {reason.kind === "dependencyDelay" && (
              // e.g. "In dependency delay: let in on 10/11 Sun (2
              // days left), counting from when Paint the wall was done".
              <span>
                {releaseText(reason.releasedOn, props.today)}
                {taskButton(reason.countedFrom)}
                {t(" was done")}
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
                    className="nextaction-blocking-reason-task"
                    data-empty={text.empty || undefined}
                    onClick={() => props.onSelectTask(id)}
                  >
                    {text.text}
                  </button>
                </span>
              );
            })}
          </li>
        ))}
      </ul>
    </Field>
  );
}
