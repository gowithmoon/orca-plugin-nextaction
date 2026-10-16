// The quick capture window (GLOSSARY: 快速捕获, #45 "快速捕获") and the command
// that opens it: a line of text and, below it, importance, urgency, effort,
// start and due with the task panel's controls, then 所属项目 (#151) from the
// task panel's candidates. Nothing is written before the capture, and every
// opening starts empty: nothing is kept from the last one. Only the review's
// projects step opens it with its 所属项目 filled in (#162), for that opening.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { InitialProperties } from "../../application/ports/task-repository";
import type { QuickCapture } from "../../application/usecases/quick-capture";
import {
  matchingProjectCandidates,
  type ReadProjectCandidates,
} from "../../application/usecases/read-project-candidates";
import type { ProjectId } from "../../domain/project/project";
import {
  type CalendarDate,
  defaultRating,
  type Rating,
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
  readProjectCandidates: ReadProjectCandidates;
  pluginName: string;
  onChange: (project: ProjectId | null) => void;
}) {
  const notify = React.useMemo(
    () => createNotify(props.pluginName),
    [props.pluginName],
  );
  const candidates = useProjectCandidates(props.readProjectCandidates, notify);
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

function QuickCapturePopup(props: {
  quickCapture: QuickCapture;
  readProjectCandidates: ReadProjectCandidates;
  pluginName: string;
  today: () => CalendarDate;
  /** The 所属项目 filled in on opening; it can be changed or cleared. */
  project: ProjectId | null;
  /** Closes the popup by unmounting it. */
  onClose: () => void;
}) {
  const { Button, CompositionInput } = orca.components;
  const idPrefix = React.useId();
  const id = (field: string) => `${idPrefix}-${field}`;
  const [text, setText] = React.useState("");
  const [draft, setDraft] = React.useState<Draft>(() => ({
    ...emptyDraft,
    project: props.project,
  }));
  // Into the text on opening, back where it was (e.g. the editor) on closing.
  const input = React.useRef<HTMLInputElement>(null);
  const capture = useQuickCapture(props.quickCapture, props.pluginName);
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
        title={t("Create task")}
        titleId={id("title")}
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
            <Field label={t("Project")} labelId={id("project")}>
              <ProjectChoice
                value={draft.project}
                readProjectCandidates={props.readProjectCandidates}
                pluginName={props.pluginName}
                onChange={set("project")}
              />
            </Field>
          </div>
        </div>
      </div>
      <WindowFooter>
        <span className="nextaction-capture-hint">
          <i className="ti ti-inbox" aria-hidden="true" />
          {t("Goes to today's journal, into the inbox")}
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
 * Opens the quick capture popup ("Create task") in `render`'s root, its
 * 所属项目 filled in with `project` when given (#162). At most one popup at a
 * time; opening it while it is open does nothing. A filled-in project that is
 * no longer a project when the task is created is left out, as the use case
 * does for any 所属项目.
 */
export type OpenQuickCapture = (project?: ProjectId) => void;

/**
 * The opener of the quick capture popup; the command ("Create task") calls
 * it without a project.
 */
export function createQuickCaptureCommand(
  quickCapture: QuickCapture,
  /** The projects offered as 所属项目, as in the task panel. */
  readProjectCandidates: ReadProjectCandidates,
  pluginName: string,
  /** The current logical day, for the dates. */
  today: () => CalendarDate,
  render: (node: React.ReactNode) => void,
): OpenQuickCapture {
  let open = false;
  return (project) => {
    if (open) return;
    open = true;
    render(
      <QuickCapturePopup
        quickCapture={quickCapture}
        readProjectCandidates={readProjectCandidates}
        pluginName={pluginName}
        today={today}
        project={project ?? null}
        onClose={() => {
          open = false;
          render(null);
        }}
      />,
    );
  };
}
