// The project panel's form (GLOSSARY: 项目属性面板, #232): shows and edits
// one project's built-in properties, then the project tag's custom
// properties (#235), each change one write and one undo.
// The fields are the task panel's (task-panel-fields.tsx); the project
// status buttons are its status field's, with the five project statuses.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { AddNewProjectBlockRefTarget } from "../../application/usecases/add-new-project-block-ref-target";
import type { ChangeProjectStatus } from "../../application/usecases/change-project-status";
import type { EditProject } from "../../application/usecases/edit-project";
import type { ReadBlockRefCandidates } from "../../application/usecases/read-block-ref-candidates";
import type { ReadProjectForPanel } from "../../application/usecases/read-project-for-panel";
import type { TaskCustomProperty } from "../../application/usecases/read-task";
import type { SetProjectCustomProperty } from "../../application/usecases/set-project-custom-property";
import {
  type Project,
  type ProjectChanges,
  type ProjectId,
  type ProjectStatus,
  projectStatuses,
} from "../../domain/project/project";
import type { CustomPropertyValue } from "../../domain/task/custom-property";
import type { CalendarDate } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { t } from "../../shared/l10n/l10n";
import { importanceName, urgencyName } from "../components/format";
import { TaskPlaceholder } from "../components/loading-placeholder";
import { projectStatusLabel } from "../components/project-status-label";
import {
  FailedNotice,
  PausedNotice,
  ViewNotice,
} from "../components/view-notice";
import { useLiveProject } from "../hooks/use-live-project";
import type { Notify } from "../notify";
import { notifyProjectActionFailure } from "../project-menu/builtin-items";
import { projectStatusIcons } from "../project-menu/project-status-icons";
import {
  type BlockRefsDeps,
  CustomPropertiesField,
} from "../task-panel/custom-properties-field";
import {
  DateField,
  Field,
  NoteField,
  RatingField,
} from "../task-panel/task-panel-fields";

export interface ProjectPanelFormDeps {
  readProjectForPanel: ReadProjectForPanel;
  /** Shared with the project menu's project statuses (#144). */
  changeProjectStatus: ChangeProjectStatus;
  editProject: EditProject;
  /** Writes one custom property of the project tag (#235). */
  setProjectCustomProperty: SetProjectCustomProperty;
  /** Adds a new page to a block reference custom property. */
  addNewProjectBlockRefTarget: AddNewProjectBlockRefTarget;
  /** Blocks offered to a block reference custom property. */
  readProjectBlockRefCandidates: ReadBlockRefCandidates;
  /** Opens the project block in a note panel; failures are its to tell. */
  openInNotes: (projectId: ProjectId) => void;
  /** Opens a block reference target in the notes; failures are its to tell. */
  openBlockInNotes: (blockId: number) => void;
  notify: Notify;
  /** Projects may have changed: the project is read again. */
  changes: ChangeSignalSource;
  /** Whether the project tag is paused, told apart from "not a project". */
  projectsPaused: () => boolean;
  /** The current logical day, for dates. */
  today: () => CalendarDate;
  /** The plugin is unloading: unmounting now writes nothing. */
  unloading: () => boolean;
}

/** Five buttons, as the task panel's status field, in the project status colours. */
function ProjectStatusField(props: {
  labelId: string;
  status: ProjectStatus;
  onChange: (status: ProjectStatus) => void;
}) {
  return (
    <fieldset
      className="nextaction-status-buttons nextaction-project-status-buttons"
      aria-labelledby={props.labelId}
    >
      {projectStatuses.map((status) => {
        const icon = projectStatusIcons[status];
        const current = status === props.status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={current}
            className="nextaction-status-button"
            data-current={current || undefined}
            style={
              {
                "--nextaction-status-color": icon.color,
              } as React.CSSProperties
            }
            // Choosing the current project status writes nothing.
            onClick={() => current || props.onChange(status)}
          >
            <i className={icon.className} aria-hidden="true" />
            <span className="nextaction-status-button-label">
              {projectStatusLabel(status)}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}

function Header(props: {
  project: Project | undefined;
  titleId: string;
  onOpenInNotes: (() => void) | undefined;
  onClose: () => void;
}) {
  const { Button, Tooltip } = orca.components;
  const { project } = props;
  const empty = project !== undefined && project.text.trim() === "";
  const name = project
    ? empty
      ? t("(No text)")
      : project.text
    : t("Project panel");
  const icon = project && projectStatusIcons[project.status];
  return (
    <header className="nextaction-task-panel-header">
      {icon && (
        <i
          className={`${icon.className} nextaction-project-panel-icon`}
          style={{ color: icon.color }}
          aria-hidden="true"
        />
      )}
      {props.onOpenInNotes ? (
        // The name opens the project block in the notes (and the popup
        // closes, not to cover it).
        <button
          type="button"
          className="nextaction-task-panel-title nextaction-project-panel-name"
          id={props.titleId}
          data-empty={empty || undefined}
          title={t("Open in notes")}
          onClick={props.onOpenInNotes}
        >
          {name}
        </button>
      ) : (
        <div className="nextaction-task-panel-title" id={props.titleId}>
          {name}
        </div>
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
  project: Project;
  customProperties: readonly TaskCustomProperty[];
  today: CalendarDate;
  idPrefix: string;
  edit: (changes: ProjectChanges) => Promise<boolean>;
  changeStatus: (status: ProjectStatus) => void;
  setCustomProperty: (
    name: string,
    value: CustomPropertyValue,
  ) => Promise<boolean>;
  blockRefs: BlockRefsDeps;
  saveOnLeave: () => boolean;
}) {
  const { project, today, idPrefix, edit } = props;
  const id = (field: string) => `${idPrefix}-${field}`;
  const saveGoal = React.useCallback(
    (goal: string | null) => edit({ goal }),
    [edit],
  );
  return (
    <div className="nextaction-task-fields">
      <Field label={t("Project status")} labelId={id("status")}>
        <ProjectStatusField
          labelId={id("status")}
          status={project.status}
          onChange={props.changeStatus}
        />
      </Field>
      <Field label={t("Goal")} labelId={id("goal")}>
        <NoteField
          labelId={id("goal")}
          note={project.goal}
          onSave={saveGoal}
          saveOnLeave={props.saveOnLeave}
          placeholder={t("What counts as done")}
          multiline={true}
        />
      </Field>
      <Field label={t("Start")} labelId={id("start")}>
        <DateField
          labelId={id("start")}
          value={project.start}
          today={today}
          onChange={(start) => void edit({ start })}
        />
      </Field>
      <Field label={t("Due")} labelId={id("due")}>
        <DateField
          labelId={id("due")}
          value={project.due}
          today={today}
          onChange={(due) => void edit({ due })}
        />
      </Field>
      <Field label={t("Importance")} labelId={id("importance")}>
        <RatingField
          labelId={id("importance")}
          value={project.importance}
          name={importanceName}
          onChange={(importance) => void edit({ importance })}
        />
      </Field>
      <Field label={t("Urgency")} labelId={id("urgency")}>
        <RatingField
          labelId={id("urgency")}
          value={project.urgency}
          name={urgencyName}
          onChange={(urgency) => void edit({ urgency })}
        />
      </Field>
      <CustomPropertiesField
        idPrefix={idPrefix}
        properties={props.customProperties}
        today={today}
        saveOnLeave={props.saveOnLeave}
        onChange={props.setCustomProperty}
        blockRefs={props.blockRefs}
      />
    </div>
  );
}

export function ProjectPanelForm(props: {
  deps: ProjectPanelFormDeps;
  /** May be a mirror's ID; the project read is the source's. */
  projectId: ProjectId;
  /** The project went away or the user closed it. */
  onClose: () => void;
  /** After the name opened the project block in the notes. */
  onOpenedInNotes: () => void;
}) {
  const { deps, projectId, onClose } = props;
  const idPrefix = React.useId();
  const { state, reload } = useLiveProject(
    deps.readProjectForPanel,
    projectId,
    deps.changes,
    deps.projectsPaused,
  );
  /** Set once the project is going away, so nothing more is written or told. */
  const leaving = React.useRef(false);
  const { unloading, notify } = deps;
  const saveOnLeave = React.useCallback(
    () => !leaving.current && !unloading(),
    [unloading],
  );

  // Each change is its own use case call: one write, one undo. A failure is
  // told, and the project read again to show what the notes hold.
  const edit = React.useCallback(
    async (changes: ProjectChanges) => {
      try {
        await deps.editProject(projectId, changes);
        return true;
      } catch (error) {
        notifyProjectActionFailure(notify, error, (reason) =>
          t("Could not save the change: ${reason}", { reason }),
        );
        reload();
        return false;
      }
    },
    [deps.editProject, projectId, notify, reload],
  );
  // Custom properties as the task panel writes them: told and read again
  // on failure, e.g. a property just deleted or changed in Orca.
  const runCustom = React.useCallback(
    async (write: () => Promise<void>) => {
      try {
        await write();
        return true;
      } catch (error) {
        notifyProjectActionFailure(notify, error, (reason) =>
          t("Could not save the change: ${reason}", { reason }),
        );
        reload();
        return false;
      }
    },
    [notify, reload],
  );
  const setCustomProperty = React.useCallback(
    (name: string, value: CustomPropertyValue) =>
      runCustom(() => deps.setProjectCustomProperty(projectId, name, value)),
    [runCustom, deps.setProjectCustomProperty, projectId],
  );
  const addNewBlockRefTarget = React.useCallback(
    (name: string, text: string) =>
      runCustom(() => deps.addNewProjectBlockRefTarget(projectId, name, text)),
    [runCustom, deps.addNewProjectBlockRefTarget, projectId],
  );
  const { openBlockInNotes } = deps;
  const { onOpenedInNotes } = props;
  // A target opened in the notes closes the popup, as the name does.
  const blockRefs = React.useMemo<BlockRefsDeps>(
    () => ({
      readBlockRefCandidates: deps.readProjectBlockRefCandidates,
      addNew: addNewBlockRefTarget,
      notify,
      onOpen: (blockId) => {
        openBlockInNotes(blockId);
        onOpenedInNotes();
      },
    }),
    [
      deps.readProjectBlockRefCandidates,
      addNewBlockRefTarget,
      notify,
      openBlockInNotes,
      onOpenedInNotes,
    ],
  );
  const changeStatus = (status: ProjectStatus) => {
    deps.changeProjectStatus(projectId, status).catch((error: unknown) => {
      notifyProjectActionFailure(notify, error, (reason) =>
        t("Could not change the project status: ${reason}", { reason }),
      );
      reload();
    });
  };

  // Dropped, deleted or untagged (here or elsewhere): tell the user, then close.
  React.useEffect(() => {
    if (state.kind !== "gone" || leaving.current) return;
    leaving.current = true;
    notify("warn", t("This block is no longer a project"));
    onClose();
  }, [state.kind, notify, onClose]);

  const project = state.kind === "loaded" ? state.project : undefined;
  let body: React.ReactNode;
  if (state.kind === "loaded") {
    body = (
      <Fields
        project={state.project}
        customProperties={state.customProperties}
        today={deps.today()}
        idPrefix={idPrefix}
        edit={edit}
        changeStatus={changeStatus}
        setCustomProperty={setCustomProperty}
        blockRefs={blockRefs}
        saveOnLeave={saveOnLeave}
      />
    );
  } else if (state.kind === "paused") {
    body = <PausedNotice />;
  } else if (state.kind === "projectsPaused") {
    body = <ProjectsPausedNotice />;
  } else if (state.kind === "failed") {
    body = (
      <FailedNotice
        error={state.error}
        message={(reason) =>
          t("Could not read the project: ${reason}", { reason })
        }
        onRetry={reload}
      />
    );
  } else {
    body = <TaskPlaceholder />;
  }

  return (
    <section
      className="nextaction-task-panel nextaction-project-panel"
      aria-labelledby={`${idPrefix}-title`}
    >
      <Header
        project={project}
        titleId={`${idPrefix}-title`}
        onOpenInNotes={
          project &&
          (() => {
            deps.openInNotes(project.id);
            props.onOpenedInNotes();
          })
        }
        onClose={onClose}
      />
      <div className="nextaction-task-panel-body">{body}</div>
    </section>
  );
}

/** The project tag is paused (#143), as the projects view says it. */
function ProjectsPausedNotice() {
  return (
    <ViewNotice
      icon="ti ti-player-pause"
      title={t("Projects are paused")}
      detail={t(
        "The project tag could not be set up. Check the project tag name in the plugin settings.",
      )}
    />
  );
}
