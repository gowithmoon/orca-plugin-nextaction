import type { Task, TaskId, TaskStatus } from "../../domain/task/task";
import type { TaskChanges } from "../../domain/task/task-changes";

/**
 * What a plugin block property of a task holds. `unreadable`: something is
 * stored, but not in a format this plugin reads (a newer version wrote it, or
 * it is damaged); it is kept as it is and cannot be written.
 */
export type PluginBlockPropertyRead =
  | { kind: "present"; data: Readonly<Record<string, unknown>> }
  | { kind: "absent" }
  | { kind: "unreadable"; reason: string };

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
 * Step 2 built this port: reading (#20), querying (#21), writing properties
 * and plugin block properties (#22).
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

  /**
   * Writes the properties present in `changes` and leaves the others as they
   * are; the user undoes the write with one undo. Fails, writing nothing,
   * when the block is not a task or a property is invalidated. A mirror
   * block's ID writes to its source block.
   */
  updateTask(id: TaskId, changes: TaskChanges): Promise<void>;

  /**
   * The plugin block property `key` of a task. A block that is not a task
   * reads as `absent`, even if it still holds such a property.
   */
  readPluginBlockProperty(
    id: TaskId,
    key: string,
  ): Promise<PluginBlockPropertyRead>;

  /**
   * Replaces the plugin block property `key` of a task with `data`. Fails,
   * writing nothing, when the block is not a task or the property holds a
   * value this plugin cannot read.
   */
  writePluginBlockProperty(
    id: TaskId,
    key: string,
    data: Readonly<Record<string, unknown>>,
  ): Promise<void>;
}
