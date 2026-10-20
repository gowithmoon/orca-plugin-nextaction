// The task panel's 后续任务 row (#208, GLOSSARY: 后续任务): the tasks not done
// that depend directly on this one, in note order, each with its status
// icon; a task name switches the task panel to that task. Read only: a
// dependency is removed in the dependent's own dependencies field. Hidden
// when there is none. The list is the shared block reference field's, without
// its remove buttons and search. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { ReadDependents } from "../../application/usecases/read-dependents";
import type { TaskId } from "../../domain/task/task";
import type { ChangeSignalSource } from "../../shared/change-signal";
import { t } from "../../shared/l10n/l10n";
import { StatusIcon } from "../components/status-icon";
import { useDependents } from "../hooks/use-dependents";
import type { Notify } from "../notify";
import { BlockRefsField } from "./block-refs-field";
import { Field } from "./task-panel-fields";

export function DependentsField(props: {
  readDependents: ReadDependents;
  taskId: TaskId;
  changes: ChangeSignalSource;
  notify: Notify;
  labelId: string;
  /** Switches the task panel to task `taskId`. */
  onSelectTask: (taskId: TaskId) => void;
}) {
  const dependents = useDependents(
    props.readDependents,
    props.taskId,
    props.changes,
    props.notify,
  );
  if (dependents.length === 0) return null;
  return (
    <Field label={t("Dependents")} labelId={props.labelId}>
      <BlockRefsField
        labelId={props.labelId}
        items={dependents.map((dependent) => ({
          id: dependent.id,
          text: dependent.text,
          before: <StatusIcon status={dependent.status} />,
          removable: false,
        }))}
        // Every item is a task with its text: never shown.
        missingText=""
        onOpen={props.onSelectTask}
        removeLabel=""
        onRemove={() => {}}
        searchable={false}
        options={[]}
        filterFunction={(_keyword, all) => all ?? []}
        filterPlaceholder=""
        placeholder=""
        onPick={() => {}}
      />
    </Field>
  );
}
