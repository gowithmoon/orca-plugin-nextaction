// The task panel's form (GLOSSARY: 任务属性面板, #35 "任务属性面板"): shows and
// edits one task's properties. It gets a task ID, reads the task itself and
// calls the use cases; it does not know whether it sits in a popup or a side
// pane. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { Candidates } from "../../application/ports/task-repository";
import type { DropTask } from "../../application/usecases/drop-task";
import type { EditTask } from "../../application/usecases/edit-task";
import type { ReadCandidates } from "../../application/usecases/read-candidates";
import type { ReadDependencyCandidates } from "../../application/usecases/read-dependency-candidates";
import type { ReadNotNextActionReasons } from "../../application/usecases/read-not-next-action-reasons";
import type { ReadTask } from "../../application/usecases/read-task";
import type { SetDependencies } from "../../application/usecases/set-dependencies";
import type { SetDependencyMode } from "../../application/usecases/set-dependency-mode";
import type { SetSequential } from "../../application/usecases/set-sequential";
import { isOverdue } from "../../domain/task/overdue";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { t } from "../../shared/l10n/l10n";
import {
  effortName,
  formatContext,
  importanceName,
  shownText,
  urgencyName,
} from "../components/format";
import { StatusIcon } from "../components/status-icon";
import { markedStatus } from "../components/status-menu";
import { FailedNotice, PausedNotice } from "../components/view-notice";
import { useCandidates } from "../hooks/use-candidates";
import { useLiveTask } from "../hooks/use-live-task";
import {
  type TaskActionsDeps,
  useTaskActions,
} from "../hooks/use-task-actions";
import { useTaskPanelActions } from "../hooks/use-task-panel-actions";
import { ChoicesField } from "./choices-field";
import { DependenciesField } from "./dependencies-field";
import { NotNextActionReasonsField } from "./not-next-action-reasons-field";
import {
  DateField,
  DependencyDelayField,
  DependencyModeField,
  Field,
  NoteField,
  RatingField,
  SequentialField,
  StatusField,
} from "./task-panel-fields";

export interface TaskPanelFormDeps {
  readTask: ReadTask;
  editTask: EditTask;
  dropTask: DropTask;
  /** Values offered for contexts and labels. */
  readCandidates: ReadCandidates;
  /** Why the task is not a next action, for the row of that name (#78). */
  readNotNextActionReasons: ReadNotNextActionReasons;
  /** Switches sequential on or off (#59). */
  setSequential: SetSequential;
  /** Tasks offered to add as dependencies (#57). */
  readDependencyCandidates: ReadDependencyCandidates;
  /** Replaces the task's dependencies (#57). */
  setDependencies: SetDependencies;
  /** Chooses how the task's dependencies are met (#58). */
  setDependencyMode: SetDependencyMode;
  /** Status change, "open in notes" and notices, shared with the task card (#39). */
  actions: TaskActionsDeps;
  /** Tasks may have changed: the task is read again. */
  changes: ChangeSignalSource;
  /** The current logical day, for dates and overdue. */
  today: () => CalendarDate;
  /**
   * The plugin is unloading: the form unmounting now writes nothing, as
   * what writes is being released.
   */
  unloading: () => boolean;
}

export interface TaskPanelFormProps {
  deps: TaskPanelFormDeps;
  /** May be a mirror's ID; the task read is the source's. */
  taskId: TaskId;
  /** The task went away (dropped here or elsewhere) or the user closed it. */
  onClose: () => void;
  /** After "Open in notes" (e.g. a popup closes, as it would cover the block). */
  onOpenedInNotes?: () => void;
  /**
   * The user picked another task from inside the form (a task named in the
   * reasons it is not a next action, #54, #78): the task panel switches to
   * it.
   */
  onSelectTask: (taskId: TaskId) => void;
}

function Header(props: {
  task: Task | undefined;
  titleId: string;
  onOpenInNotes: (() => void) | undefined;
  onClose: () => void;
}) {
  const { Button, Tooltip } = orca.components;
  const { task } = props;
  const title = task && shownText(task);
  return (
    <header className="nextaction-task-panel-header">
      {task && <StatusIcon status={task.status} />}
      <div
        className="nextaction-task-panel-title"
        id={props.titleId}
        data-empty={title?.empty || undefined}
      >
        {title ? title.text : t("Task panel")}
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
  candidates: Candidates;
  /** Read only, after the status: only shown while the task is not a next action. */
  notNextActionReasons: React.ReactNode;
  /** The dependencies list and search to add (#57). */
  dependencies: React.ReactNode;
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
          status={markedStatus(task)}
          onChange={(status) => void actions.changeStatus(status)}
        />
      </Field>
      {props.notNextActionReasons}
      <Field label={t("Importance")} labelId={id("importance")}>
        <RatingField
          labelId={id("importance")}
          value={task.importance}
          name={importanceName}
          onChange={(importance) => void actions.edit({ importance })}
        />
      </Field>
      <Field label={t("Urgency")} labelId={id("urgency")}>
        <RatingField
          labelId={id("urgency")}
          value={task.urgency}
          name={urgencyName}
          onChange={(urgency) => void actions.edit({ urgency })}
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
      <Field label={t("Context")} labelId={id("contexts")}>
        <ChoicesField
          labelId={id("contexts")}
          values={task.contexts}
          candidates={props.candidates.contexts}
          display={formatContext}
          placeholder={t("No context")}
          onChange={(contexts) => void actions.edit({ contexts })}
        />
      </Field>
      <Field label={t("Label")} labelId={id("labels")}>
        <ChoicesField
          labelId={id("labels")}
          values={task.labels}
          candidates={props.candidates.labels}
          display={(label) => label}
          placeholder={t("No label")}
          onChange={(labels) => void actions.edit({ labels })}
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
      {/* Always shown, whether or not the task has subtasks (#59). */}
      <Field label={t("Sequential")} labelId={id("sequential")}>
        <SequentialField
          labelId={id("sequential")}
          on={task.sequential}
          onChange={(sequential) => void actions.setSequential(sequential)}
        />
      </Field>
      <Field label={t("Dependencies")} labelId={id("dependencies")}>
        {props.dependencies}
      </Field>
      {/* Only with two dependencies or more, stale ones included (#58). */}
      {task.dependencies.length >= 2 && (
        <Field label={t("Dependency mode")} labelId={id("dependency-mode")}>
          <DependencyModeField
            labelId={id("dependency-mode")}
            mode={task.dependencyMode}
            onChange={(mode) => void actions.setDependencyMode(mode)}
          />
        </Field>
      )}
      {/* Only with dependencies, stale ones included (#77). */}
      {task.dependencies.length >= 1 && (
        <Field label={t("Dependency delay")} labelId={id("dependency-delay")}>
          <DependencyDelayField
            labelId={id("dependency-delay")}
            days={task.dependencyDelay}
            onSave={(dependencyDelay) => void actions.edit({ dependencyDelay })}
          />
        </Field>
      )}
    </div>
  );
}

export function TaskPanelForm(props: TaskPanelFormProps) {
  const { deps, taskId, onClose } = props;
  const { Button, Tooltip } = orca.components;
  const idPrefix = React.useId();
  const { state, reload } = useLiveTask(deps.readTask, taskId, deps.changes);
  const actions = useTaskPanelActions(deps, taskId, reload);
  const taskActions = useTaskActions(deps.actions);
  const { notify } = deps.actions;
  const candidates = useCandidates(deps.readCandidates, deps.changes, notify);
  /** Set once the task is going away, so nothing more is written or told. */
  const leaving = React.useRef(false);
  // Leaving writes the note unless the task went away or the plugin is
  // unloading (what writes is being released then).
  const { unloading } = deps;
  const saveOnLeave = React.useCallback(
    () => !leaving.current && !unloading(),
    [unloading],
  );

  // Dropped, deleted or untagged (here or elsewhere): tell the user, then close.
  React.useEffect(() => {
    if (state.kind !== "gone" || leaving.current) return;
    leaving.current = true;
    deps.actions.notify("warn", t("This block is no longer a task"));
    onClose();
  }, [state.kind, deps.actions, onClose]);

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
        candidates={candidates}
        notNextActionReasons={
          // Only a task to do or in progress gets reasons (#78); the use
          // case returns none for the rest, so the row stays hidden.
          <NotNextActionReasonsField
            readNotNextActionReasons={deps.readNotNextActionReasons}
            taskId={state.task.id}
            changes={deps.changes}
            notify={notify}
            labelId={`${idPrefix}-not-next-action`}
            today={deps.today()}
            onSelectTask={props.onSelectTask}
          />
        }
        dependencies={
          <DependenciesField
            labelId={`${idPrefix}-dependencies`}
            taskId={state.task.id}
            dependencies={state.task.dependencies}
            readNotNextActionReasons={deps.readNotNextActionReasons}
            readDependencyCandidates={deps.readDependencyCandidates}
            changes={deps.changes}
            notify={notify}
            onChange={(dependencies) =>
              void actions.setDependencies(dependencies)
            }
            onSelectTask={props.onSelectTask}
          />
        }
      />
    );
  } else if (state.kind === "paused") {
    body = <PausedNotice />;
  } else if (state.kind === "failed") {
    body = (
      <FailedNotice
        error={state.error}
        message={(reason) =>
          t("Could not read the task: ${reason}", { reason })
        }
        onRetry={reload}
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
        onOpenInNotes={
          task &&
          (() => {
            // Failures are told by the shared action (#39).
            taskActions.openInNotes(task);
            props.onOpenedInNotes?.();
          })
        }
        onClose={onClose}
      />
      <div className="nextaction-task-panel-body">{body}</div>
      {task && (
        <footer className="nextaction-task-panel-footer">
          {/* An icon, grey until pointed at; one click drops, undoable in Orca. */}
          <Tooltip text={t("Drop this task")}>
            <Button
              variant="plain"
              className="nextaction-task-drop"
              aria-label={t("Drop this task")}
              onClick={() => void drop()}
            >
              <i className="ti ti-trash" aria-hidden="true" />
            </Button>
          </Tooltip>
        </footer>
      )}
    </section>
  );
}
