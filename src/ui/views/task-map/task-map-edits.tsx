// The task map's writes of the relations (#220): sequential on a parent
// task's box head, the dependency mode and delay in a dependent's popover.
// Each change is its own use case call, so one change is one undo. Failures
// are told with the task panel's notices: switching sequential on refused
// for making a dependency cycle says why, as there. The map reads again on
// the change signal. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { EditTask } from "../../../application/usecases/edit-task";
import type { SetDependencyMode } from "../../../application/usecases/set-dependency-mode";
import type { SetSequential } from "../../../application/usecases/set-sequential";
import type { DependencyMode, TaskId } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { type Notify, notifyActionFailure } from "../../notify";

export interface TaskMapEditsDeps {
  setSequential: SetSequential;
  setDependencyMode: SetDependencyMode;
  /** Writes the dependency delay (the task's, not one dependency's). */
  editTask: EditTask;
}

/** The writes, each resolving to whether it succeeded; none throws. */
export interface TaskMapEdits {
  setSequential(id: TaskId, sequential: boolean): Promise<boolean>;
  setDependencyMode(id: TaskId, mode: DependencyMode): Promise<boolean>;
  /** `null` clears it. */
  setDependencyDelay(id: TaskId, days: number | null): Promise<boolean>;
}

const TaskMapEditsContext = React.createContext<TaskMapEdits | undefined>(
  undefined,
);

/** The writes; `undefined` outside the task map (nothing to edit with). */
export function useTaskMapEdits(): TaskMapEdits | undefined {
  return React.useContext(TaskMapEditsContext);
}

export function TaskMapEditsProvider(props: {
  deps: TaskMapEditsDeps;
  notify: Notify;
  children: React.ReactNode;
}) {
  const { deps, notify } = props;
  const edits = React.useMemo<TaskMapEdits>(() => {
    const run = async (write: () => Promise<unknown>) => {
      try {
        await write();
        return true;
      } catch (error) {
        notifyActionFailure(notify, error, (reason) =>
          t("Could not save the change: ${reason}", { reason }),
        );
        return false;
      }
    };
    return {
      setSequential: (id, sequential) =>
        run(() => deps.setSequential(id, sequential)),
      setDependencyMode: (id, mode) =>
        run(() => deps.setDependencyMode(id, mode)),
      setDependencyDelay: (id, dependencyDelay) =>
        run(() => deps.editTask(id, { dependencyDelay })),
    };
  }, [deps, notify]);
  return (
    <TaskMapEditsContext.Provider value={edits}>
      {props.children}
    </TaskMapEditsContext.Provider>
  );
}
