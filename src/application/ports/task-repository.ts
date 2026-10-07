import type { Task, TaskId, TaskStatus } from "../../domain/task/task";

/** Values a multi-value property (contexts, labels) must or must not hold. */
export interface ValuesFilter {
  /** The task holds every one of these. */
  includes?: readonly string[];
  /** The task holds none of these. */
  excludes?: readonly string[];
}

/**
 * Which tasks a query matches. Every given condition must hold; an empty
 * filter matches every task.
 */
export interface TaskFilter {
  /** The task is in one of these statuses. */
  statuses?: readonly [TaskStatus, ...TaskStatus[]];
  contexts?: ValuesFilter;
  labels?: ValuesFilter;
  /** The task is somewhere below this block, at any depth. */
  underBlockId?: number;
}

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

  /** Every task matching the filter, in no particular order. */
  queryTasks(filter: TaskFilter): Promise<Task[]>;
}
