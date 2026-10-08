// The task panel's form (GLOSSARY: 任务属性面板, #35 "任务属性面板"): shows and
// edits one task's properties. It gets a task ID, reads the task itself and
// calls the use cases; it does not know whether it sits in a popup or a side
// pane. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ReadTask } from "../../application/usecases/read-task";
import { isOverdue } from "../../domain/task/overdue";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import { effortName, importanceName } from "../components/format";
import { StatusIcon } from "../components/status-icon";
import { useLiveTask } from "../hooks/use-live-task";
import {
  type TaskPanelUseCases,
  useTaskPanelActions,
} from "../hooks/use-task-panel-actions";
import { createNotify } from "../notify";
import {
  DateField,
  Field,
  NoteField,
  RatingField,
  StatusField,
} from "./task-panel-fields";

export interface TaskPanelFormDeps {
  readTask: ReadTask;
  useCases: TaskPanelUseCases;
  /** Tasks may have changed: the task is read again. */
  changes: ChangeSignalSource;
  /** Titles the notices. */
  pluginName: string;
  /** The current logical day, for dates and overdue. */
  today: () => CalendarDate;
}

export interface TaskPanelFormProps {
  deps: TaskPanelFormDeps;
  /** May be a mirror's ID; the task read is the source's. */
  taskId: TaskId;
  /** The task went away (dropped here or elsewhere) or the user closed it. */
  onClose: () => void;
  /** The "Open in notes" button; its failures are the shell's to report. */
  onOpenInNotes: (taskId: TaskId) => void;
}

function Notice(props: {
  icon: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="nextaction-view-notice" role="status">
      <i className={props.icon} aria-hidden="true" />
      <div className="nextaction-view-notice-title">{props.title}</div>
      {props.action}
    </div>
  );
}

function Header(props: {
  task: Task | undefined;
  titleId: string;
  onOpenInNotes: (() => void) | undefined;
  onClose: () => void;
}) {
  const { Button, Tooltip } = orca.components;
  const { task } = props;
  const text = task?.text.trim() ?? "";
  return (
    <header className="nextaction-task-panel-header">
      {task && <StatusIcon status={task.status} />}
      <div
        className="nextaction-task-panel-title"
        id={props.titleId}
        data-empty={(task !== undefined && text === "") || undefined}
      >
        {task ? (text === "" ? t("(No text)") : task.text) : t("Task panel")}
      </div>
      {props.onOpenInNotes && (
        <Tooltip text={t("Open in notes")}>
          <Button
            variant="plain"
            aria-label={t("Open in notes")}
            onClick={props.onOpenInNotes}
          >
            <i className="ti ti-external-link" aria-hidden="true" />
          </Button>
        </Tooltip>
      )}
      <Tooltip text={t("Close")}>
        <Button variant="plain" aria-label={t("Close")} onClick={props.onClose}>
          <i className="ti ti-x" aria-hidden="true" />
        </Button>
      </Tooltip>
    </header>
  );
}

function Fields(props: {
  task: Task;
  today: CalendarDate;
  idPrefix: string;
  actions: ReturnType<typeof useTaskPanelActions>;
  /** Whether a note typed but not saved is still written on leaving. */
  saveOnLeave: () => boolean;
}) {
  const { task, today, idPrefix, actions } = props;
  const id = (field: string) => `${idPrefix}-${field}`;
  const saveNote = React.useCallback(
    (note: string | null) => actions.edit({ note }),
    [actions],
  );
  return (
    <div className="nextaction-task-fields">
      <Field label={t("Status")} labelId={id("status")}>
        <StatusField
          labelId={id("status")}
          status={task.status}
          onChange={(status) => void actions.changeStatus(status)}
        />
      </Field>
      <Field label={t("Importance")} labelId={id("importance")}>
        <RatingField
          labelId={id("importance")}
          value={task.importance}
          name={importanceName}
          onChange={(importance) => void actions.edit({ importance })}
        />
      </Field>
      <Field label={t("Effort")} labelId={id("effort")}>
        <RatingField
          labelId={id("effort")}
          value={task.effort}
          name={effortName}
          onChange={(effort) => void actions.edit({ effort })}
        />
      </Field>
      <Field label={t("Start")} labelId={id("start")}>
        <DateField
          labelId={id("start")}
          value={task.start}
          today={today}
          onChange={(start) => void actions.edit({ start })}
        />
      </Field>
      <Field label={t("Due")} labelId={id("due")}>
        <DateField
          labelId={id("due")}
          value={task.due}
          today={today}
          overdue={isOverdue(task, today)}
          onChange={(due) => void actions.edit({ due })}
        />
      </Field>
      <Field label={t("Note")} labelId={id("note")}>
        <NoteField
          labelId={id("note")}
          note={task.note}
          onSave={saveNote}
          saveOnLeave={props.saveOnLeave}
        />
      </Field>
    </div>
  );
}

export function TaskPanelForm(props: TaskPanelFormProps) {
  const { deps, taskId, onClose } = props;
  const { Button } = orca.components;
  const idPrefix = React.useId();
  const { state, reload } = useLiveTask(deps.readTask, taskId, deps.changes);
  const actions = useTaskPanelActions(
    deps.useCases,
    taskId,
    deps.pluginName,
    reload,
  );
  /** Set once the task is going away, so nothing more is written or told. */
  const leaving = React.useRef(false);
  const saveOnLeave = React.useCallback(() => !leaving.current, []);

  // Dropped, deleted or untagged (here or elsewhere): tell the user, then close.
  React.useEffect(() => {
    if (state.kind !== "gone" || leaving.current) return;
    leaving.current = true;
    createNotify(deps.pluginName)("warn", t("This block is no longer a task"));
    onClose();
  }, [state.kind, deps.pluginName, onClose]);

  const drop = async () => {
    leaving.current = true;
    if (await actions.drop()) onClose();
    else leaving.current = false;
  };

  const task = state.kind === "loaded" ? state.task : undefined;
  let body: React.ReactNode;
  if (state.kind === "loaded") {
    body = (
      <Fields
        task={state.task}
        today={deps.today()}
        idPrefix={idPrefix}
        actions={actions}
        saveOnLeave={saveOnLeave}
      />
    );
  } else if (state.kind === "paused") {
    body = (
      <Notice
        icon="ti ti-player-pause"
        title={t(
          "Task features are paused. See the plugin's earlier notice or its task tag setting.",
        )}
      />
    );
  } else if (state.kind === "failed") {
    body = (
      <Notice
        icon="ti ti-alert-circle"
        title={t("Could not read the task: ${reason}", {
          reason: describeError(state.error),
        })}
        action={
          <Button variant="outline" onClick={reload}>
            {t("Retry")}
          </Button>
        }
      />
    );
  } else {
    body = (
      <div role="status" aria-label={t("Loading the task")}>
        <orca.components.Skeleton />
      </div>
    );
  }

  return (
    <section
      className="nextaction-task-panel"
      aria-labelledby={`${idPrefix}-title`}
    >
      <Header
        task={task}
        titleId={`${idPrefix}-title`}
        onOpenInNotes={task && (() => props.onOpenInNotes(task.id))}
        onClose={onClose}
      />
      <div className="nextaction-task-panel-body">{body}</div>
      {task && (
        <footer className="nextaction-task-panel-footer">
          <Button variant="dangerous" onClick={() => void drop()}>
            <i className="ti ti-trash" aria-hidden="true" />
            {t("Drop this task")}
          </Button>
        </footer>
      )}
    </section>
  );
}
