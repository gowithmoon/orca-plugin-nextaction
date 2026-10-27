// The quick capture window (GLOSSARY: 快速捕获, #45 "快速捕获") and the command
// that opens it: a line of text and, below it, importance, urgency, effort,
// start and due with the task panel's controls, then 所属项目 (#151) from the
// task panel's candidates. Nothing is written before the capture, and every
// opening starts empty: nothing is kept from the last one. Only the review's
// projects step opens it with its 所属项目 filled in (#162), for that opening.
// The task menu's "Create subtask" (#190) opens the same window for a parent
// task: titled so, the parent named under the title, and 所属项目 read only, as
// the parent decides it (GLOSSARY: 所属项目). Opened for a project (the
// project details, the review's projects step), it has a 位置 above 所属项目
// (#239): the end of the project, every opening's default, or today's
// journal. At the end of the project 所属项目 shows the project read only,
// "from its location"; the draft's own 所属项目 is kept for today's journal.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { InitialProperties } from "../../application/ports/task-repository";
import type {
  CreateSubtask,
  ReadSubtaskProject,
} from "../../application/usecases/create-subtask";
import type { QuickCapture } from "../../application/usecases/quick-capture";
import type { QuickCaptureInProject } from "../../application/usecases/quick-capture-in-project";
import {
  matchingProjectCandidates,
  type ProjectCandidate,
  type ReadProjectCandidates,
} from "../../application/usecases/read-project-candidates";
import type { ProjectId } from "../../domain/project/project";
import {
  type CalendarDate,
  defaultRating,
  type Rating,
  type Task,
} from "../../domain/task/task";
import type { SelectOption } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import {
  effortName,
  importanceName,
  shownText,
  urgencyName,
} from "../components/format";
import {
  PluginWindow,
  WindowFooter,
  WindowHeader,
} from "../components/plugin-window";
import { Select } from "../components/popup-controls";
import { useProjectCandidates } from "../hooks/use-project-candidates";
import { useQuickCapture } from "../hooks/use-quick-capture";
import { useSubtaskProject } from "../hooks/use-subtask-project";
import { createNotify } from "../notify";
import { projectStatusIcons } from "../project-menu/project-status-icons";
import { DateField, Field, RatingField } from "../task-panel/task-panel-fields";

interface Draft {
  importance: Rating;
  urgency: Rating;
  effort: Rating;
  start: CalendarDate | null;
  due: CalendarDate | null;
  project: ProjectId | null;
}

const emptyDraft: Draft = {
  importance: defaultRating,
  urgency: defaultRating,
  effort: defaultRating,
  start: null,
  due: null,
  project: null,
};

/**
 * Only what the user set: the rest is left for Orca to fill with its
 * defaults (inbox-anomalous-status).
 */
function initialProperties(draft: Draft): InitialProperties {
  return {
    ...(draft.importance !== defaultRating && { importance: draft.importance }),
    ...(draft.urgency !== defaultRating && { urgency: draft.urgency }),
    ...(draft.effort !== defaultRating && { effort: draft.effort }),
    ...(draft.start && { start: draft.start }),
    ...(draft.due && { due: draft.due }),
    ...(draft.project !== null && { project: draft.project }),
  };
}

/** The line of text leads the window, a size up from the fields. */
const captureTextStyle: React.CSSProperties = {
  padding: "var(--orca-spacing-md)",
  borderRadius: "var(--orca-radius-md)",
  fontSize: "var(--orca-fontsize-md)",
};

/**
 * The 所属项目 choice: one project from the candidates, searched as in the
 * task panel, with a clear at the bottom; empty for none.
 */
function ProjectChoice(props: {
  value: ProjectId | null;
  /** Read by the window, the filled-in project offered even when done (#162). */
  candidates: readonly ProjectCandidate[];
  onChange: (project: ProjectId | null) => void;
}) {
  const { candidates } = props;
  const options: SelectOption[] = candidates.map((candidate) => ({
    value: String(candidate.id),
    label: shownText(candidate).text,
    icon: projectStatusIcons[candidate.status].className,
  }));
  return (
    <Select
      selected={props.value === null ? [] : [String(props.value)]}
      options={options}
      filter={true}
      filterFunction={(keyword, all) => {
        const found = new Set(
          matchingProjectCandidates(candidates, keyword).map((c) =>
            String(c.id),
          ),
        );
        return (all ?? options).filter(
          (option) => option.value !== undefined && found.has(option.value),
        );
      }}
      filterPlaceholder={t("Search projects")}
      placeholder={t("No project")}
      withClear={true}
      width="100%"
      alignment="left"
      onChange={(selected) => {
        const picked = Number(selected[0]);
        props.onChange(Number.isInteger(picked) ? picked : null);
      }}
    />
  );
}

/**
 * A 所属项目 shown read only: the status icon, the name and where it comes
 * from, as the task panel shows one decided for the task.
 */
function ReadOnlyProject(props: {
  labelId: string;
  project: Pick<ProjectCandidate, "text" | "status">;
  source: string;
}) {
  const icon = projectStatusIcons[props.project.status];
  const text = shownText(props.project);
  return (
    <Field label={t("Project")} labelId={props.labelId}>
      <span className="nextaction-capture-project">
        <i
          className={icon.className}
          style={{ color: icon.color }}
          aria-hidden="true"
        />
        <span data-empty={text.empty || undefined}>{text.text}</span>
        <span className="nextaction-capture-project-source">
          {props.source}
        </span>
      </span>
    </Field>
  );
}

/** Where a capture opened for a project puts the new task (#239). */
type Location = "project" | "journal";

const locations: readonly Location[] = ["project", "journal"];

const locationChoices: Record<
  Location,
  { readonly icon: string; readonly label: () => string }
> = {
  project: { icon: "ti ti-folder", label: () => t("End of project") },
  journal: { icon: "ti ti-calendar", label: () => t("Today's journal") },
};

/** The 位置 switch: two segments in the layout switch's look. */
function LocationSwitch(props: {
  labelId: string;
  value: Location;
  onChange: (location: Location) => void;
}) {
  const { Segmented } = orca.components;
  return (
    <Field label={t("Location")} labelId={props.labelId}>
      <Segmented
        role="group"
        aria-labelledby={props.labelId}
        className="nextaction-layout-switch nextaction-capture-location"
        selected={props.value}
        options={locations.map((value) => ({
          value,
          jsx: (
            <span className="nextaction-layout-icon nextaction-capture-location-option">
              <i className={locationChoices[value].icon} aria-hidden="true" />
              {locationChoices[value].label()}
            </span>
          ),
        }))}
        onChange={(value) => {
          const chosen = locations.find((l) => l === value);
          if (chosen) props.onChange(chosen);
        }}
      />
    </Field>
  );
}

/**
 * A new subtask's 所属项目, read only: the parent task's (#190). Nothing
 * shows when there is none.
 */
function SubtaskProject(props: {
  labelId: string;
  parentId: Task["id"];
  readSubtaskProject: ReadSubtaskProject;
  pluginName: string;
}) {
  const notify = React.useMemo(
    () => createNotify(props.pluginName),
    [props.pluginName],
  );
  const project = useSubtaskProject(
    props.readSubtaskProject,
    props.parentId,
    notify,
  );
  if (!project) return null;
  return (
    <ReadOnlyProject
      labelId={props.labelId}
      project={project}
      source={t("· From parent task")}
    />
  );
}

/** What the window creates: a task in today's journal, or a subtask. */
type CaptureKind =
  | {
      kind: "capture";
      quickCapture: QuickCapture;
      /** The 所属项目 filled in on opening; it can be changed or cleared. */
      project: ProjectId | null;
      /**
       * Present when opened for `project` (#239): the new task can go at its
       * end. Absent for the command, a project picked in the window or not.
       */
      inProject?: QuickCaptureInProject;
    }
  | {
      kind: "subtask";
      createSubtask: CreateSubtask;
      readSubtaskProject: ReadSubtaskProject;
      parent: Task;
    };

function QuickCapturePopup(props: {
  what: CaptureKind;
  readProjectCandidates: ReadProjectCandidates;
  pluginName: string;
  today: () => CalendarDate;
  /** Closes the popup by unmounting it. */
  onClose: () => void;
}) {
  const { what } = props;
  const { Button, CompositionInput } = orca.components;
  const idPrefix = React.useId();
  const id = (field: string) => `${idPrefix}-${field}`;
  const [text, setText] = React.useState("");
  const [draft, setDraft] = React.useState<Draft>(() => ({
    ...emptyDraft,
    project: what.kind === "capture" ? what.project : null,
  }));
  // Opened for a project: its end on every opening, never remembered.
  const forProject =
    what.kind === "capture" && what.inProject && what.project !== null
      ? { id: what.project, capture: what.inProject }
      : null;
  const [location, setLocation] = React.useState<Location>("project");
  const atProjectEnd = forProject !== null && location === "project";
  const notify = React.useMemo(
    () => createNotify(props.pluginName),
    [props.pluginName],
  );
  // Read once for the window: offered as 所属项目, and naming the project
  // shown read only at its end.
  const candidates = useProjectCandidates(
    props.readProjectCandidates,
    notify,
    what.kind === "capture" ? what.project : null,
  );
  const shownProject = forProject
    ? candidates.find((c) => c.id === forProject.id)
    : undefined;
  // Into the text on opening, back where it was (e.g. the editor) on closing.
  const input = React.useRef<HTMLInputElement>(null);
  const run = React.useCallback(
    (text: string, initial: InitialProperties) => {
      // The parent, or the project block, decides the project: none is passed.
      const { project: _none, ...rest } = initial;
      if (what.kind === "subtask") {
        return what.createSubtask(what.parent.id, text, rest);
      }
      if (what.inProject && what.project !== null && location === "project") {
        return what.inProject(what.project, text, rest);
      }
      return what.quickCapture(text, initial);
    },
    [what, location],
  );
  const capture = useQuickCapture(
    run,
    props.pluginName,
    what.kind === "subtask"
      ? t("Subtask created")
      : atProjectEnd
        ? t("Task created and added to the project")
        : t("Task created and added to today's journal"),
  );
  const today = props.today();
  const blank = text.trim() === "";

  // Kept here until the capture; the fields do not know where they are.
  const set =
    <K extends keyof Draft>(key: K) =>
    (value: Draft[K]) =>
      setDraft((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    // Empty text and failures keep the window, its text and its properties.
    if ((await capture(text, initialProperties(draft))) === "captured") {
      props.onClose();
    }
  };

  const onTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter that confirms an IME composition is not a capture.
    if (e.nativeEvent.isComposing || e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    void submit();
  };

  return (
    <PluginWindow
      onClose={props.onClose}
      // Narrower than the task panel's: four fields and a line of text
      // (quick-capture-style.ts).
      className="nextaction-capture"
      labelledBy={id("title")}
      focus={input}
    >
      <WindowHeader
        title={what.kind === "capture" ? t("Create task") : t("Create subtask")}
        titleId={id("title")}
        // A subtask's parent under the title, as a task's window names its task.
        {...(what.kind === "subtask" && { task: what.parent })}
        onClose={props.onClose}
      />
      <div className="nextaction-capture-body">
        <CompositionInput
          ref={input}
          className="nextaction-capture-text"
          // Orca's Input puts `style` on the input element itself.
          style={captureTextStyle}
          aria-label={t("Task name")}
          placeholder={t("Task name, press Enter to create")}
          value={text}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setText(e.target.value)
          }
          onKeyDown={onTextKeyDown}
        />
        <div className="nextaction-capture-fields">
          <div className="nextaction-task-fields">
            <Field label={t("Importance")} labelId={id("importance")}>
              <RatingField
                labelId={id("importance")}
                value={draft.importance}
                name={importanceName}
                onChange={set("importance")}
              />
            </Field>
            <Field label={t("Urgency")} labelId={id("urgency")}>
              <RatingField
                labelId={id("urgency")}
                value={draft.urgency}
                name={urgencyName}
                onChange={set("urgency")}
              />
            </Field>
            <Field label={t("Effort")} labelId={id("effort")}>
              <RatingField
                labelId={id("effort")}
                value={draft.effort}
                name={effortName}
                onChange={set("effort")}
              />
            </Field>
            <Field label={t("Start")} labelId={id("start")}>
              <DateField
                labelId={id("start")}
                value={draft.start}
                today={today}
                onChange={set("start")}
              />
            </Field>
            <Field label={t("Due")} labelId={id("due")}>
              <DateField
                labelId={id("due")}
                value={draft.due}
                today={today}
                onChange={set("due")}
              />
            </Field>
            {forProject && (
              <LocationSwitch
                labelId={id("location")}
                value={location}
                onChange={setLocation}
              />
            )}
            {atProjectEnd ? (
              // Named once the candidates are read; nothing until then.
              shownProject && (
                <ReadOnlyProject
                  labelId={id("project")}
                  project={shownProject}
                  source={t("· From its location")}
                />
              )
            ) : what.kind === "capture" ? (
              <Field label={t("Project")} labelId={id("project")}>
                <ProjectChoice
                  value={draft.project}
                  candidates={candidates}
                  onChange={set("project")}
                />
              </Field>
            ) : (
              <SubtaskProject
                labelId={id("project")}
                parentId={what.parent.id}
                readSubtaskProject={what.readSubtaskProject}
                pluginName={props.pluginName}
              />
            )}
          </div>
        </div>
      </div>
      <WindowFooter>
        <span className="nextaction-capture-hint">
          <i className="ti ti-inbox" aria-hidden="true" />
          {what.kind === "subtask"
            ? t("Goes below the parent task, into the inbox")
            : atProjectEnd
              ? t("Goes to the end of the project, into the inbox")
              : t("Goes to today's journal, into the inbox")}
        </span>
        <Button variant="plain" onClick={props.onClose}>
          {t("Cancel")}
        </Button>
        <Button variant="solid" disabled={blank} onClick={() => void submit()}>
          {t("Create")}
        </Button>
      </WindowFooter>
    </PluginWindow>
  );
}

/**
 * Opens the quick capture popup ("Create task") in `render`'s root. With
 * `project` it is opened for that project: 位置 offers its end, the default,
 * or today's journal with 所属项目 filled in (#162, #239). At most one popup
 * at a time; opening it while it is open does nothing. At the end of a
 * project that is no longer one nothing is written and the window stays; in
 * today's journal a filled-in project that is no longer one is left out, as
 * the use case does for any 所属项目.
 */
export type OpenQuickCapture = (project?: ProjectId) => void;

/**
 * Opens the same window as "Create subtask" of task `parent` (#190), in the
 * same root: at most one of the two is open at a time.
 */
export type OpenCreateSubtask = (parent: Task) => void;

/**
 * The openers of the capture window; the command ("Create task") calls
 * `openQuickCapture` without a project.
 */
export function createQuickCaptureCommand(
  deps: {
    quickCapture: QuickCapture;
    quickCaptureInProject: QuickCaptureInProject;
    createSubtask: CreateSubtask;
    readSubtaskProject: ReadSubtaskProject;
    /** The projects offered as 所属项目, as in the task panel. */
    readProjectCandidates: ReadProjectCandidates;
    pluginName: string;
    /** The current logical day, for the dates. */
    today: () => CalendarDate;
  },
  render: (node: React.ReactNode) => void,
): {
  openQuickCapture: OpenQuickCapture;
  openCreateSubtask: OpenCreateSubtask;
} {
  let open = false;
  const show = (what: CaptureKind) => {
    if (open) return;
    open = true;
    render(
      <QuickCapturePopup
        what={what}
        readProjectCandidates={deps.readProjectCandidates}
        pluginName={deps.pluginName}
        today={deps.today}
        onClose={() => {
          open = false;
          render(null);
        }}
      />,
    );
  };
  return {
    openQuickCapture: (project) =>
      show({
        kind: "capture",
        quickCapture: deps.quickCapture,
        project: project ?? null,
        ...(project !== undefined && {
          inProject: deps.quickCaptureInProject,
        }),
      }),
    openCreateSubtask: (parent) =>
      show({
        kind: "subtask",
        createSubtask: deps.createSubtask,
        readSubtaskProject: deps.readSubtaskProject,
        parent,
      }),
  };
}
