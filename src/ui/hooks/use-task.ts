// Reads a task for a component, e.g. the task menu inside Orca's menus,
// whose `render` is synchronous. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ReadTask } from "../../application/usecases/read-task";
import type { Task, TaskId } from "../../domain/task/task";

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
  const [task, setTask] = React.useState<Task | null | undefined>(undefined);
  // Read once per ID; a changing callback does not read again.
  const reportError = React.useRef(onError);
  reportError.current = onError;

  React.useEffect(() => {
    if (id === undefined) {
      setTask(null);
      return;
    }
    // A read that ends after the menu closed or moved on is ignored.
    let current = true;
    setTask(undefined);
    readTask(id).then(
      (read) => {
        if (current) setTask(read);
      },
      (error: unknown) => {
        if (!current) return;
        setTask(null);
        reportError.current(error);
      },
    );
    return () => {
      current = false;
    };
  }, [readTask, id]);

  return task;
}
