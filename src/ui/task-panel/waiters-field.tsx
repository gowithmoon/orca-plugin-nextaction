// The task panel's 阻塞 row (#208, GLOSSARY: 它阻塞的任务): the tasks not done
// waiting for this one directly (its parent task, the later subtasks under a
// sequential parent, its 后续任务), each with its status icon and, at the
// row's end, what it is to this one; a task name switches the task panel to that task.
// Read only. Hidden when there is none. The list is the shared block
// reference list, without remove buttons. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type {
  Waiter,
  WaiterKind,
} from "../../application/usecases/read-waiters";
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { StatusIcon } from "../components/status-icon";
import { BlockRefsList } from "./block-refs-field";
import { Field } from "./task-panel-fields";

function kindLabel(kind: WaiterKind): string {
  switch (kind) {
    case "parent":
      return t("Parent");
    case "laterInSequence":
      return t("Later in sequence");
    case "dependent":
      return t("Dependent");
  }
}

export function WaitersField(props: {
  /** The waiters as last read with the panel's relations. */
  waiters: readonly Waiter[];
  labelId: string;
  /** Switches the task panel to task `taskId`. */
  onSelectTask: (taskId: TaskId) => void;
}) {
  const { waiters } = props;
  if (waiters.length === 0) return null;
  return (
    <Field label={t("Blocks")} labelId={props.labelId}>
      <BlockRefsList
        labelId={props.labelId}
        items={waiters.map((waiter) => ({
          id: waiter.id,
          text: waiter.text,
          before: <StatusIcon status={waiter.status} />,
          after: (
            <span className="nextaction-waiter-kinds">
              {waiter.kinds.map(kindLabel).join(" · ")}
            </span>
          ),
        }))}
        onOpen={props.onSelectTask}
        singleLine
      />
    </Field>
  );
}
