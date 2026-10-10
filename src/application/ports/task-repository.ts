import type { TaskGraphSnapshot } from "../../domain/blocking/task-graph";
import type { MovePlacement } from "../../domain/blocking/task-move";
import type { CompletionHistory } from "../../domain/task/completion-history";
import type { Task, TaskId, TaskStatus } from "../../domain/task/task";
import type { TaskChanges } from "../../domain/task/task-changes";

/**
 * What a task's completion history (GLOSSARY: 完成历史) reads as. A task
 * without one reads as an empty history. `unreadable`: something is stored
 * that this plugin cannot read (an unknown version, or damaged); it is kept
 * as it is and cannot be written.
 */
export type CompletionHistoryRead =
  | { kind: "readable"; history: CompletionHistory }
  | { kind: "unreadable"; reason: string };

/** Values a multi-value property (contexts, labels) must or must not hold. */
export interface ValuesFilter {
  /** The task holds every one of these. */
  includes?: readonly string[];
  /** The task holds none of these. */
  excludes?: readonly string[];
}

/** The multi-value properties whose values the user picks from candidates. */
export type ChoiceProperty = "contexts" | "labels";

/** The values offered for each multi-value property. */
export type Candidates = Record<ChoiceProperty, string[]>;

/**
 * Which tasks a query matches. Every given condition must hold; an empty
 * filter matches every task.
 */
export interface TaskFilter {
  /**
   * The task is in one of these statuses. A task whose status is empty or
   * unknown in the notes reads as inbox, but matches no status filter, not
   * even inbox (inbox-anomalous-status): filter the decoded status instead.
   */
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
 * Orca writes only through a panel with an editor (a journal or block panel,
 * or the plugin panel), and none is open. Nothing was written; `ui` asks the
 * user to open one.
 */
export class NoNotePanelError extends Error {
  override name = "NoNotePanelError";
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
 * Properties a quick capture sets on the new task (GLOSSARY: 快速捕获). Those
 * not given take their defaults: importance and effort 4, no dates. Taken from
 * `TaskChanges`, so the two cannot drift; a new task has no date to clear, so
 * the dates are never `null`.
 */
export type InitialProperties = Pick<TaskChanges, "importance" | "effort"> & {
  readonly [K in "start" | "due"]?: NonNullable<TaskChanges[K]>;
};

/**
 * Where tasks are read from and written to. Implementations hide every Orca
 * detail: mirror blocks, orphans, note-facing names and error conversion.
 *
 * Step 2 built this port: reading (#20), querying (#21), writing properties
 * and plugin block properties (#22). Step 3 adds converting (#27), dropping
 * (#31), quick capture and the completion history (#32).
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
   * Every task, done ones included, each with its parent task (its nearest
   * task ancestor in the block tree, plain blocks in between not counting,
   * ADR 0003; `null` for none) and its place in the notes (document
   * preorder). Positions only compare: lower comes first. One read.
   */
  readTaskGraph(): Promise<TaskGraphSnapshot>;

  /**
   * The values to offer for contexts and labels, each once per property, in
   * no particular order: the task tag's choices for that property, and the
   * values tasks already hold. An invalidated property has none. Both come
   * from one read of the tasks.
   */
  readCandidates(): Promise<Candidates>;

  /**
   * Writes the properties present in `changes` and leaves the others as they
   * are; with `completionHistory`, also replaces the task's completion
   * history with it. Contexts and labels written are made choices of the
   * task tag first, so they show in the notes and become candidates. The
   * user undoes the whole write with one undo. Fails, writing nothing, when
   * the block is not a task, a property is invalidated, or the completion
   * history is to be replaced but reads as unreadable. A mirror block's ID
   * writes to its source block.
   */
  updateTask(
    id: TaskId,
    changes: TaskChanges,
    completionHistory?: CompletionHistory,
  ): Promise<void>;

  /**
   * The completion history of a task. A block that is not a task reads as an
   * empty history, even if it still holds one.
   */
  readCompletionHistory(id: TaskId): Promise<CompletionHistoryRead>;

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
   * Drops the task (GLOSSARY: 放弃): in one undo, removes the task tag and
   * deletes every plugin block property of the block, so it is a plain block
   * again, and removes it from the dependencies of every task that depended
   * on it, their other dependencies kept (ADR 0016). The block itself is
   * never deleted. Subtasks are left as they are. A mirror block's ID drops its
   * source block. Fails, writing nothing, when the block is not a task or the
   * write fails.
   */
  dropTask(id: TaskId): Promise<void>;

  /**
   * Creates an inbox task with `text`, as plain text, at the end of the
   * journal of the calendar day `now` falls on in local time (not the logical
   * day, ADR 0005), creating that journal if it does not exist yet, with the
   * `initial` properties given. The user undoes it, properties included, with
   * one undo. Returns the new task's ID.
   */
  appendTaskToJournal(
    text: string,
    now: Date,
    initial?: InitialProperties,
  ): Promise<TaskId>;

  /**
   * Moves the task's block, with every block below it, to `placement`
   * relative to the target task's block: its last child block, or just before
   * or after it (#63). The user undoes it with one undo. A mirror block's ID,
   * moved or target, stands for its source block. Fails, writing nothing,
   * when either block is not a task, the target is the moved block or below
   * it, or the write fails.
   */
  moveTask(id: TaskId, target: TaskId, placement: MovePlacement): Promise<void>;
}
