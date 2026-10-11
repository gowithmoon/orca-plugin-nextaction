// Shared by the My Day use cases that write a task's entries.
import type { TaskId } from "../../domain/task/task";

/**
 * The task's My Day entries hold something this plugin cannot read (an
 * unknown version, or damaged), so they cannot be changed: writing would
 * overwrite them. Nothing was written. `reason` says what could not be read,
 * for the user's notice.
 */
export class MyDayUnreadableError extends Error {
  override name = "MyDayUnreadableError";

  constructor(
    id: TaskId,
    readonly reason: string,
  ) {
    super(`the My Day entries of task ${id} cannot be read (${reason})`);
  }
}
