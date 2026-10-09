// The task panel's writes (#35 "任务属性面板"): every change is its own use
// case call, so one write is one undo. Failures are told to the user with the
// same notices as the task menu. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { DropTask } from "../../application/usecases/drop-task";
import type { EditTask, TaskEdits } from "../../application/usecases/edit-task";
import type { SetDependencies } from "../../application/usecases/set-dependencies";
import type { SetSequential } from "../../application/usecases/set-sequential";
import type { TaskId, TaskStatus } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { changeStatusReporting, notifyActionFailure } from "../notify";
import type { TaskActionsDeps } from "./use-task-actions";

export interface TaskPanelWrites {
  editTask: EditTask;
  dropTask: DropTask;
  setSequential: SetSequential;
  /** Replaces the task's dependencies (#57). */
  setDependencies: SetDependencies;
  /** The plugin panel's status change and notices (#39). */
  actions: TaskActionsDeps;
}

/**
 * Writes for task `id`. `edit` and `drop` resolve to whether the write
 * succeeded; after a failure the user was told why and `onFailed` is called
 * (the panel reads the task again, to show what the notes really hold).
 * `changeStatus` reports its own failures and never throws.
 */
export function useTaskPanelActions(
  writes: TaskPanelWrites,
  id: TaskId,
  onFailed: () => void,
): {
  edit(edits: TaskEdits): Promise<boolean>;
  changeStatus(status: TaskStatus): Promise<void>;
  drop(): Promise<boolean>;
  setSequential(sequential: boolean): Promise<boolean>;
  setDependencies(dependencies: readonly TaskId[]): Promise<boolean>;
} {
  const failed = React.useRef(onFailed);
  failed.current = onFailed;

  return React.useMemo(() => {
    const { notify } = writes.actions;
    const run = async (
      write: () => Promise<unknown>,
      reason: (reason: string) => string,
    ) => {
      try {
        await write();
        return true;
      } catch (error) {
        notifyActionFailure(notify, error, reason);
        failed.current();
        return false;
      }
    };
    return {
      edit: (edits) =>
        run(
          () => writes.editTask(id, edits),
          (reason) => t("Could not save the change: ${reason}", { reason }),
        ),
      changeStatus: (status) =>
        changeStatusReporting(writes.actions.changeStatus, notify, id, status),
      async drop() {
        const dropped = await run(
          () => writes.dropTask(id),
          (reason) => t("Could not drop the task: ${reason}", { reason }),
        );
        if (dropped) notify("info", t("Task dropped"));
        return dropped;
      },
      setSequential: (sequential) =>
        run(
          () => writes.setSequential(id, sequential),
          (reason) => t("Could not save the change: ${reason}", { reason }),
        ),
      setDependencies: (dependencies) =>
        run(
          () => writes.setDependencies(id, dependencies),
          (reason) => t("Could not save the change: ${reason}", { reason }),
        ),
    };
  }, [writes, id]);
}
