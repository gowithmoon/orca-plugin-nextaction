// The task panel's 所属项目 (#146, GLOSSARY: 所属项目, ADR 0025): the project
// the task belongs to and where that comes from, in the shared block
// reference field (#115), one value only. Decided by a parent task: read
// only, the parent task named and clickable. Decided by its location: a
// project can be set, which then counts. Its own or none: searched, picked
// and cleared. The task's own setting that does not count is struck through,
// "not in effect" (overridden) or "stale" (no longer a project), and can be
// removed. Every set, change or clear is one write, so one undo; it replaces
// whatever the task held, a stale setting too (ADR 0016). While the project
// tag is paused it reads as no project, with nothing to set (US103). Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
import {
  matchingProjectCandidates,
  type ProjectCandidate,
} from "../../application/usecases/read-project-candidates";
import type {
  ProjectOfTaskRead,
  ProjectShown,
} from "../../application/usecases/read-project-of-task";
import type { ProjectId } from "../../domain/project/project";
import type { TaskId } from "../../domain/task/task";
import type { SelectOption } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import { shownText } from "../components/format";
import { projectStatusLabel } from "../components/project-status-label";
import { projectStatusIcons } from "../project-menu/project-status-icons";
import { BlockRefsField, type BlockRefsFieldItem } from "./block-refs-field";

/** The project's status icon, in its colour, before its name. */
function StatusIconOf(props: { project: ProjectShown }) {
  const icon = projectStatusIcons[props.project.status];
  return (
    <i
      className={`${icon.className} nextaction-project-of-task-icon`}
      style={{ color: icon.color }}
      role="img"
      aria-label={projectStatusLabel(props.project.status)}
    />
  );
}

export function ProjectOfTaskField(props: {
  labelId: string;
  /** The 所属项目 as last read with the panel's relations. */
  read: ProjectOfTaskRead;
  /** The projects offered, as last read with the panel's relations. */
  candidates: readonly ProjectCandidate[];
  /** Writes the task's own setting, `null` clearing it. */
  onChange: (project: ProjectId | null) => void;
  /** Opens the project in the notes. */
  onOpenProject: (projectId: ProjectId) => void;
  /** Switches the task panel to task `taskId`. */
  onSelectTask: (taskId: TaskId) => void;
}) {
  const { read, candidates } = props;
  const { project, source, ownSetting } = read;
  const items: BlockRefsFieldItem[] = [];
  if (project && source) {
    items.push({
      id: project.id,
      key: "decided",
      text: project.text,
      before: <StatusIconOf project={project} />,
      after:
        source.kind === "location" ? (
          <span className="nextaction-project-of-task-source">
            {t("· From its location")}
          </span>
        ) : source.kind === "parentTask" ? (
          <span className="nextaction-project-of-task-source">
            {t("· From parent task")}{" "}
            <button
              type="button"
              className="nextaction-project-of-task-parent"
              data-empty={shownText(source.task).empty || undefined}
              onClick={() => props.onSelectTask(source.task.id)}
            >
              {shownText(source.task).text}
            </button>
          </span>
        ) : undefined,
      // Only its own setting is removed here; a location is changed by
      // setting one, a parent task's is read only.
      removable: source.kind === "own",
    });
  }
  if (ownSetting?.kind === "overridden") {
    items.push({
      id: ownSetting.project.id,
      key: "overridden",
      text: ownSetting.project.text,
      struck: true,
      before: <StatusIconOf project={ownSetting.project} />,
      after: (
        <span className="nextaction-dependency-stale">
          {t("Not in effect")}
        </span>
      ),
    });
  } else if (ownSetting?.kind === "stale") {
    items.push({
      // No block to open: `text: null` shows `missingText` instead.
      id: -1,
      key: "stale",
      text: null,
      struck: true,
      after: <span className="nextaction-dependency-stale">{t("Stale")}</span>,
    });
  }
  // Only a parent task's decision leaves nothing to set (ADR 0025); while
  // the project tag is paused nothing is set or cleared either (US103).
  const searchable = source?.kind !== "parentTask" && !read.projectsPaused;
  const offered = candidates.filter((c) => c.id !== project?.id);
  const options: SelectOption[] = offered.map((candidate) => ({
    value: String(candidate.id),
    label: shownText(candidate).text,
    icon: projectStatusIcons[candidate.status].className,
  }));
  return (
    <BlockRefsField
      labelId={props.labelId}
      items={items}
      missingText={t("(No longer a project)")}
      onOpen={props.onOpenProject}
      removeLabel={t("Remove project")}
      onRemove={() => props.onChange(null)}
      below={
        read.projectsPaused ? (
          <span className="nextaction-project-of-task-source">
            {t("No project")}
          </span>
        ) : undefined
      }
      searchable={searchable}
      options={options}
      filterFunction={(keyword, all) => {
        const found = new Set(
          matchingProjectCandidates(offered, keyword).map((c) => String(c.id)),
        );
        return (all ?? options).filter(
          (option) => option.value !== undefined && found.has(option.value),
        );
      }}
      filterPlaceholder={t("Search projects")}
      placeholder={
        source?.kind === "own" ? t("Change project") : t("Set a project")
      }
      onPick={(picked) => props.onChange(picked)}
    />
  );
}
