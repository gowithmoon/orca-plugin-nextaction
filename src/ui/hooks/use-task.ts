// Reads a task (or a project) for a component, e.g. the task menu inside
// Orca's menus, whose `render` is synchronous. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ReadTask } from "../../application/usecases/read-task";
import type { Task, TaskId } from "../../domain/task/task";

/**
 * What `read(id)` gives: `undefined` while it is read, `null` when there is
 * none or the read failed (`onError` is called once). No `id` reads nothing
 * and stays `null`. Shared by `useTask` and `useProject`.
 */
export function useReadById<T>(
  read: (id: number) => Promise<T | null>,
  id: number | undefined,
  onError: (error: unknown) => void,
): T | null | undefined {
  const [value, setValue] = React.useState<T | null | undefined>(undefined);
  // Read once per ID; a changing callback does not read again.
  const reportError = React.useRef(onError);
  reportError.current = onError;

  React.useEffect(() => {
    if (id === undefined) {
      setValue(null);
      return;
    }
    // A read that ends after the menu closed or moved on is ignored.
    let current = true;
    setValue(undefined);
    read(id).then(
      (result) => {
        if (current) setValue(result);
      },
      (error: unknown) => {
        if (!current) return;
        setValue(null);
        reportError.current(error);
      },
    );
    return () => {
      current = false;
    };
  }, [read, id]);

  return value;
}

/**
 * The task `id`: `undefined` while it is read, `null` when the block is not
 * a task or the read failed (`onError` is called once). No `id` reads nothing
 * and stays `null`.
 */
export function useTask(
  readTask: ReadTask,
  id: TaskId | undefined,
  onError: (error: unknown) => void,
): Task | null | undefined {
  return useReadById(readTask, id, onError);
}
