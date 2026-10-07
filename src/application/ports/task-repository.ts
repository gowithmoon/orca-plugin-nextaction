import type { Task, TaskId } from "../../domain/task/task";

/**
 * Where tasks are read from and written to. Implementations hide every Orca
 * detail: mirror blocks, orphans, note-facing names and error conversion.
 *
 * Step 2 grows this port one ticket at a time: querying (#21), writing
 * properties and plugin block properties (#22).
 */
export interface TaskRepository {
  /**
   * The task with the given block ID, or `null` when that block is not a task
   * (no task tag, an orphan, or no such block). A mirror block reads as the
   * task of its source block.
   */
  getTask(id: TaskId): Promise<Task | null>;
}
