// The task panel's dependencies (#57, GLOSSARY: 依赖, 失效依赖): the tasks
// this one waits for, each removable on its own, stale ones marked; tasks are
// added by searching their text. Every add or remove is one write, so one
// undo. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { ReadBlockingReasons } from "../../application/usecases/read-blocking-reasons";
import type { ReadDependencyCandidates } from "../../application/usecases/read-dependency-candidates";
import type { TaskId } from "../../domain/task/task";
import type { SelectOption } from "../../orca.d.ts";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { t } from "../../shared/l10n/l10n";
import { shownText } from "../components/format";
import { usePopupLayer } from "../components/popup-layer";
import { useBlockingReasons } from "../hooks/use-blocking-reasons";
import { useDependencyCandidates } from "../hooks/use-dependency-candidates";
import type { Notify } from "../notify";

export function DependenciesField(props: {
  labelId: string;
  taskId: TaskId;
  /** The task's dependencies as last read with the task. */
  dependencies: readonly TaskId[];
  readBlockingReasons: ReadBlockingReasons;
  readDependencyCandidates: ReadDependencyCandidates;
  changes: ChangeSignalSource;
  notify: Notify;
  /** Writes the whole new list; the use case clears stale ones with it. */
  onChange: (dependencies: TaskId[]) => void;
  /** Switches the task panel to task `taskId`. */
  onSelectTask: (taskId: TaskId) => void;
}) {
  const { Button, Select, Tooltip } = orca.components;
  const popupLayer = usePopupLayer();
  // The text and staleness of each dependency come with the blocking
  // reasons: both are what the task graph says about the task.
  const { dependencies: shown } = useBlockingReasons(
    props.readBlockingReasons,
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
  const options: SelectOption[] = candidates
    .filter((candidate) => !current.includes(candidate.id))
    .map((candidate) => ({
      value: String(candidate.id),
      label: shownText(candidate).text,
    }))
    .sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));

  return (
    <div className="nextaction-dependencies-field">
      {shown.length > 0 && (
        <ul className="nextaction-dependencies" aria-labelledby={props.labelId}>
          {shown.map((dependency) => {
            const text =
              dependency.text === null
                ? undefined
                : shownText({ text: dependency.text });
            return (
              <li
                key={dependency.id}
                className="nextaction-dependency"
                data-stale={dependency.stale || undefined}
              >
                {text ? (
                  <button
                    type="button"
                    className="nextaction-dependency-task"
                    data-empty={text.empty || undefined}
                    onClick={() => props.onSelectTask(dependency.id)}
                  >
                    {text.text}
                  </button>
                ) : (
                  <span className="nextaction-dependency-task">
                    {t("(No longer a task)")}
                  </span>
                )}
                {dependency.stale && (
                  <span className="nextaction-dependency-stale">
                    {t("Stale")}
                  </span>
                )}
                <Tooltip text={t("Remove dependency")}>
                  <Button
                    variant="plain"
                    aria-label={t("Remove dependency")}
                    onClick={() =>
                      props.onChange(
                        current.filter((id) => id !== dependency.id),
                      )
                    }
                  >
                    <i className="ti ti-x" aria-hidden="true" />
                  </Button>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      )}
      <Select
        selected={[]}
        options={options}
        filter={true}
        filterPlaceholder={t("Search tasks")}
        placeholder={t("Add a dependency")}
        width="100%"
        alignment="left"
        // Inside a window the menu would be cut off by it (popup-layer.tsx).
        menuContainer={popupLayer}
        onChange={(selected) => {
          const picked = Number(selected[0]);
          if (Number.isInteger(picked) && !current.includes(picked)) {
            props.onChange([...current, picked]);
          }
        }}
      />
    </div>
  );
}
