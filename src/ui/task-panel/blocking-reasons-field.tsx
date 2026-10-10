// The task panel's blocking reasons (#54, GLOSSARY: 阻塞): read only, shown
// only while something blocks the task, e.g. "Subtasks: Write the
// introduction, Collect the data"; never for a task that is done (the task
// panel leaves it out). Each task name switches the task panel to that task.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { ReadBlockingReasons } from "../../application/usecases/read-blocking-reasons";
import type { BlockingReason } from "../../domain/blocking/task-graph";
import type { TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { t } from "../../shared/l10n/l10n";
import { shownText } from "../components/format";
import { useBlockingReasons } from "../hooks/use-blocking-reasons";
import type { Notify } from "../notify";
import { Field } from "./task-panel-fields";

/** What a reason of this kind is called before the tasks it waits for. */
function kindLabel(reason: BlockingReason): string {
  switch (reason.kind) {
    case "subtasks":
      return t("Subtasks");
    case "sequential":
      return t("Sequential");
    case "dependencies":
      return t("Dependencies");
    case "cycle":
      return t("Dependency cycle");
  }
}

/** Dependencies in mode "any": waiting for one of them, not all. */
function anyMode(reason: BlockingReason): boolean {
  return reason.kind === "dependencies" && reason.mode === "any";
}

export function BlockingReasonsField(props: {
  readBlockingReasons: ReadBlockingReasons;
  taskId: TaskId;
  changes: ChangeSignalSource;
  notify: Notify;
  labelId: string;
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
    <Field label={t("Blocked by")} labelId={props.labelId}>
      <ul
        className="nextaction-blocking-reasons"
        aria-labelledby={props.labelId}
      >
        {reasons.map((reason) => (
          <li
            key={`${reason.kind}-${reason.source}`}
            className="nextaction-blocking-reason"
          >
            {reason.source === props.taskId ? (
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
