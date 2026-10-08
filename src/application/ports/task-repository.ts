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
 * Task features are paused (the task tag is still starting, was refused or
 * failed to set up), so the repository neither reads nor writes. Thrown by
 * every method; `ui` tells the user why nothing happened.
 */
export class TaskFeaturesPausedError extends Error {
  override name = "TaskFeaturesPausedError";
}

/**
 * Why a block cannot be converted to a task (ADR 0013): it has neither a
 * parent nor an alias (a journal block, or an orphan left behind when a
 * referenced block was deleted), or it is the task tag block itself.
 */
export type NotConvertibleReason = "journal-or-orphan" | "task-tag";

/** What converting a block to a task did. `id` is the (source) block's. */
export type ConvertToTaskResult =
  | { kind: "converted"; id: TaskId }
  /** Nothing was written. */
  | { kind: "already-task"; id: TaskId }
  /** Nothing was written. */
  | { kind: "not-convertible"; reason: NotConvertibleReason };

/**
 * Where tasks are read from and written to. Implementations hide every Orca
 * detail: mirror blocks, orphans, note-facing names and error conversion.
 *
 * Step 2 built this port: reading (#20), querying (#21), writing properties
 * and plugin block properties (#22). Step 3 adds converting (#27).
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

  /**
   * Converts the block into an inbox task (GLOSSARY: 转为任务). A mirror
   * block's ID converts its source block. In one undo, every plugin block
   * property left on the block (e.g. by removing the task tag in Orca) is
   * deleted, then the task tag is added without values, so every property
   * takes its default. A task, or a block that cannot be converted, is left
   * as it is. Fails, writing nothing, when the write fails.
   */
  convertToTask(id: number): Promise<ConvertToTaskResult>;

  /**
   * Creates an inbox task with `text`, as plain text, at the end of the
   * journal of the calendar day `now` falls on in local time (not the logical
   * day, ADR 0005), creating that journal if it does not exist yet. The user
   * undoes it with one undo. Returns the new task's ID.
   */
  appendTaskToJournal(text: string, now: Date): Promise<TaskId>;
}
