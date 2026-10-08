// The task panel's writes (#35 "任务属性面板"): every change is its own use
// case call, so one write is one undo. Failures are told to the user here.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import {
  type ChangeStatus,
  CompletionHistoryUnreadableError,
} from "../../application/usecases/change-status";
import type { DropTask } from "../../application/usecases/drop-task";
import type { EditTask, TaskEdits } from "../../application/usecases/edit-task";
import type { TaskId, TaskStatus } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { createNotify } from "../notify";
// The same notices as the task menu, including the paused one.
import { notifyMenuFailure } from "../task-menu/builtin-items";

export interface TaskPanelUseCases {
  editTask: EditTask;
  changeStatus: ChangeStatus;
  dropTask: DropTask;
}

/**
 * Writes for task `id`. Each resolves to whether the write succeeded; after
 * a failure the user was told why and `onFailed` is called (the panel reads
 * the task again, to show what the notes really hold).
 */
export function useTaskPanelActions(
  useCases: TaskPanelUseCases,
  id: TaskId,
  pluginName: string,
  onFailed: () => void,
): {
  edit(edits: TaskEdits): Promise<boolean>;
  changeStatus(status: TaskStatus): Promise<boolean>;
  drop(): Promise<boolean>;
} {
  const failed = React.useRef(onFailed);
  failed.current = onFailed;

  return React.useMemo(() => {
    const notify = createNotify(pluginName);
    const run = async (
      write: () => Promise<unknown>,
      report: (error: unknown) => void,
    ) => {
      try {
        await write();
        return true;
      } catch (error) {
        report(error);
        failed.current();
        return false;
      }
    };
    return {
      edit: (edits) =>
        run(
          () => useCases.editTask(id, edits),
          (error) =>
            notifyMenuFailure(notify, error, (reason) =>
              t("Could not save the change: ${reason}", { reason }),
            ),
        ),
      changeStatus: (status) =>
        run(
          () => useCases.changeStatus(id, status),
          (error) => {
            if (error instanceof CompletionHistoryUnreadableError) {
              notify(
                "error",
                t(
                  "Could not mark the task done: its completion history cannot be read and is kept as it is.",
                ),
              );
              return;
            }
            notifyMenuFailure(notify, error, (reason) =>
              t("Could not change the status: ${reason}", { reason }),
            );
          },
        ),
      async drop() {
        const dropped = await run(
          () => useCases.dropTask(id),
          (error) =>
            notifyMenuFailure(notify, error, (reason) =>
              t("Could not drop the task: ${reason}", { reason }),
            ),
        );
        if (dropped) notify("info", t("Task dropped"));
        return dropped;
      },
    };
  }, [useCases, id, pluginName]);
}
