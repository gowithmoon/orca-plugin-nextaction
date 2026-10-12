// The task panel's dependencies (#57, GLOSSARY: 依赖, 失效依赖): the tasks
// this one waits for, each removable on its own, stale ones marked; tasks are
// added by searching their text. The list and search are the shared block
// reference field (#115); cycles and recurring tasks are this field's own. Every add or remove is one write, so one
// undo. The search finds a task by its text and its search text (#112).
// Recurring tasks, offered or picked, are marked with a hint that the
// dependency stays unmet until they no longer recur (#94, ADR 0021).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).

import type {
  DependencyCandidate,
  ReadDependencyCandidates,
} from "../../application/usecases/read-dependency-candidates";
import type { ReadNotNextActionReasons } from "../../application/usecases/read-not-next-action-reasons";
import type { TaskId } from "../../domain/task/task";
import type { SelectOption } from "../../orca.d.ts";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { t } from "../../shared/l10n/l10n";
import { shownText } from "../components/format";
import { taskSearchFilter } from "../components/task-search-filter";
import { useDependencyCandidates } from "../hooks/use-dependency-candidates";
import { useNotNextActionReasons } from "../hooks/use-not-next-action-reasons";
import type { Notify } from "../notify";
import { BlockRefsField } from "./block-refs-field";

/**
 * Why a candidate cannot be picked, shown after its text; `null` when it can
 * (#60). Orca's `Select` documents no disabled option, so the candidate stays
 * listed with the reason, last, and picking it writes nothing.
 */
function cycleText(candidate: DependencyCandidate): string | null {
  switch (candidate.cycle) {
    case null:
      return null;
    case "below":
      return t("Would make a dependency cycle: it is below this task");
    case "waits":
      return t("Would make a dependency cycle: it already waits for this task");
  }
}

/** Why depending on a recurring task keeps this one waiting (ADR 0021). */
function recurringHint(): string {
  return t(
    "A recurring task advances to its next occurrence each time it is completed; the dependency is met only once it no longer recurs and is done at last.",
  );
}

export function DependenciesField(props: {
  labelId: string;
  taskId: TaskId;
  /** The task's dependencies as last read with the task. */
  dependencies: readonly TaskId[];
  readNotNextActionReasons: ReadNotNextActionReasons;
  readDependencyCandidates: ReadDependencyCandidates;
  changes: ChangeSignalSource;
  notify: Notify;
  /** Writes the whole new list; the use case clears stale ones with it. */
  onChange: (dependencies: TaskId[]) => void;
  /** Switches the task panel to task `taskId`. */
  onSelectTask: (taskId: TaskId) => void;
}) {
  const { Tooltip } = orca.components;
  // The text and staleness of each dependency come with why the task is not
  // a next action: both are what the task graph says about the task.
  const { dependencies: shown } = useNotNextActionReasons(
    props.readNotNextActionReasons,
    props.taskId,
    props.changes,
    props.notify,
  );
  const candidates = useDependencyCandidates(
    props.readDependencyCandidates,
    props.taskId,
    props.changes,
    props.notify,
  );
  const current = props.dependencies;
  const offered = candidates.filter(
    (candidate) => !current.includes(candidate.id),
  );
  // Candidates that would make a cycle go last, each saying why.
  const options: SelectOption[] = offered
    .map((candidate) => {
      const text = shownText(candidate).text;
      const reason =
        cycleText(candidate) ??
        (candidate.recurring ? t("Recurring task") : null);
      return {
        text,
        cycles: candidate.cycle !== null,
        option: {
          value: String(candidate.id),
          label:
            reason === null ? text : t("${text} (${reason})", { text, reason }),
          ...(candidate.recurring && { icon: "ti ti-repeat" }),
        },
      };
    })
    .sort(
      (a, b) =>
        Number(a.cycles) - Number(b.cycles) || a.text.localeCompare(b.text),
    )
    .map((entry) => entry.option);

  return (
    <BlockRefsField
      labelId={props.labelId}
      items={shown.map((dependency) => ({
        id: dependency.id,
        text: dependency.text,
        struck: dependency.stale,
        after: (
          <>
            {dependency.recurring && (
              <Tooltip text={recurringHint()}>
                <span
                  className="nextaction-dependency-recurring"
                  role="img"
                  aria-label={t("Recurring task")}
                >
                  <i className="ti ti-repeat" aria-hidden="true" />
                </span>
              </Tooltip>
            )}
            {dependency.stale && (
              <span className="nextaction-dependency-stale">{t("Stale")}</span>
            )}
          </>
        ),
      }))}
      missingText={t("(No longer a task)")}
      onOpen={props.onSelectTask}
      removeLabel={t("Remove dependency")}
      onRemove={(id) => props.onChange(current.filter((d) => d !== id))}
      below={
        shown.some((dependency) => dependency.recurring) && (
          <div className="nextaction-dependency-hint">{recurringHint()}</div>
        )
      }
      options={options}
      filterFunction={taskSearchFilter(offered, options)}
      filterPlaceholder={t("Search tasks")}
      placeholder={t("Add a dependency")}
      onPick={(picked) => {
        if (current.includes(picked)) return;
        const candidate = offered.find((offer) => offer.id === picked);
        const reason = candidate ? cycleText(candidate) : null;
        if (reason !== null) {
          // Not added; the use case would refuse it as well.
          props.notify("warn", t("Not added. ${reason}", { reason }));
          return;
        }
        props.onChange([...current, picked]);
      }}
    />
  );
}
