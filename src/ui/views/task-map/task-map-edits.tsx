// The task map's writes of the relations (#220): sequential on a parent
// task's box head, the dependency mode and delay in a dependent's popover;
// a dependency drawn or deleted (#219), the whole list written with the set
// dependencies use case as the task panel does.
// Each change is its own use case call, so one change is one undo. Failures
// are told with the task panel's notices: switching sequential on refused
// for making a dependency cycle says why, as there. The map reads again on
// the change signal. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { EditTask } from "../../../application/usecases/edit-task";
import type {
  DependentRefusal,
  ReadDependentRefusals,
} from "../../../application/usecases/read-dependent-refusals";
import type { SetDependencies } from "../../../application/usecases/set-dependencies";
import type { SetDependencyMode } from "../../../application/usecases/set-dependency-mode";
import type { SetSequential } from "../../../application/usecases/set-sequential";
import type { DependencyMode, Task, TaskId } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { type Notify, notifyActionFailure } from "../../notify";

export interface TaskMapEditsDeps {
  setSequential: SetSequential;
  setDependencyMode: SetDependencyMode;
  /** Writes the dependency delay (the task's, not one dependency's). */
  editTask: EditTask;
  /** A dependency drawn or deleted (#219). */
  setDependencies: SetDependencies;
  /** Which tasks a dependency drawn from a task cannot go to (#219). */
  readDependentRefusals: ReadDependentRefusals;
}

/** The writes, each resolving to whether it succeeded; none throws. */
export interface TaskMapEdits {
  setSequential(id: TaskId, sequential: boolean): Promise<boolean>;
  setDependencyMode(id: TaskId, mode: DependencyMode): Promise<boolean>;
  /** `null` clears it. */
  setDependencyDelay(id: TaskId, days: number | null): Promise<boolean>;
  /** `dependent` comes to depend on task `on` too. */
  addDependency(dependent: Task, on: TaskId): Promise<boolean>;
  /** `dependent` no longer depends on task `on`. */
  removeDependency(dependent: Task, on: TaskId): Promise<boolean>;
  /** As the use case; `null` when it could not be read (told). */
  readDependentRefusals(
    id: TaskId,
  ): Promise<ReadonlyMap<TaskId, DependentRefusal> | null>;
  /** Tells the user why nothing was written. */
  warn(message: string): void;
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
      addDependency: (dependent, on) =>
        run(() =>
          deps.setDependencies(dependent.id, [...dependent.dependencies, on]),
        ),
      removeDependency: (dependent, on) =>
        run(() =>
          deps.setDependencies(
            dependent.id,
            dependent.dependencies.filter((id) => id !== on),
          ),
        ),
      async readDependentRefusals(id) {
        try {
          return await deps.readDependentRefusals(id);
        } catch (error) {
          notifyActionFailure(notify, error, (reason) =>
            t("Could not read the tasks to depend on: ${reason}", { reason }),
          );
          return null;
        }
      },
      warn: (message) => notify("warn", message),
    };
  }, [deps, notify]);
  return (
    <TaskMapEditsContext.Provider value={edits}>
      {props.children}
    </TaskMapEditsContext.Provider>
  );
}
