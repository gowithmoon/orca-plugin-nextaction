import type { TaskGraphSnapshot } from "../../domain/blocking/task-graph";
import type { MovePlacement } from "../../domain/blocking/task-move";
import type { RecurrenceRule } from "../../domain/recurrence/recurrence";
import type { Reminders } from "../../domain/reminder/reminder";
import type { ReviewPlan } from "../../domain/review/review";
import type { CompletionHistory } from "../../domain/task/completion-history";
import type {
  CustomPropertyDefinition,
  CustomPropertyValue,
} from "../../domain/task/custom-property";
import type { MyDayEntries, MyDayRead } from "../../domain/task/my-day";
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

/**
 * The task data held as a versioned plugin block property that the user can
 * discard when this plugin cannot read it (`discardUnreadable`).
 */
export type DiscardableData = "recurrence" | "review" | "reminders";

/** Values a multi-value property (contexts, labels) must or must not hold. */
export interface ValuesFilter {
  /** The task holds every one of these. */
  includes?: readonly string[];
  /** The task holds none of these. */
  excludes?: readonly string[];
}

/** A block offered as a block reference target (#115). */
export interface BlockCandidate {
  readonly id: number;
  /** Its text as the notes hold it; may be empty. */
  readonly text: string;
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
 * not given take their defaults: importance, urgency and effort 4, no dates.
 * Taken from `TaskChanges`, so the two cannot drift; a new task has no date to
 * clear, so the dates are never `null`.
 */
export type InitialProperties = Pick<
  TaskChanges,
  "importance" | "urgency" | "effort"
> & {
  readonly [K in "start" | "due"]?: NonNullable<TaskChanges[K]>;
};

/** One task's part of a write to several tasks (`updateTasks`). */
export interface TaskWrite {
  readonly id: TaskId;
  /** The properties to write; those absent are left as they are. */
  readonly changes: TaskChanges;
  /** Replaces the task's completion history; absent leaves it. */
  readonly completionHistory?: CompletionHistory;
  /** Replaces the task's recurrence rule, `null` removes it; absent leaves it. */
  readonly recurrence?: RecurrenceRule | null;
  /**
   * Replaces the task's reminders (GLOSSARY: 提醒), an empty list clearing
   * them; absent leaves them.
   */
  readonly reminders?: Reminders;
}

/**
 * Where tasks are read from and written to. Implementations hide every Orca
 * detail: mirror blocks, orphans, note-facing names and error conversion.
 *
 * Step 2 built this port: reading (#20), querying (#21), writing properties
 * and plugin block properties (#22). Step 3 adds converting (#27), dropping
 * (#31), quick capture and the completion history (#32). Step 7 adds the My
 * Day entries (#82).
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
   * Writes several tasks as `updateTask` writes one, each as its `TaskWrite`
   * says, and with `recurrence` also replaces its recurrence rule (`null`
   * removes it, the property kept, as `writeRecurrence` does), with
   * `reminders` its reminders (as `writeReminders` does). The user undoes
   * every task's write with one undo. Fails, writing nothing at all, when
   * any block is not a task, a property is invalidated, or a completion
   * history, recurrence rule or reminders to be replaced read as unreadable. A mirror
   * block's ID writes to its source block.
   */
  updateTasks(writes: readonly TaskWrite[]): Promise<void>;

  /**
   * The completion history of a task. A block that is not a task reads as an
   * empty history, even if it still holds one.
   */
  readCompletionHistory(id: TaskId): Promise<CompletionHistoryRead>;

  /**
   * The My Day entries of a task, every logical day's (GLOSSARY: 我的一天记录).
   * A block that is not a task reads as no entries, even if it still holds
   * some. A mirror block's ID reads its source block.
   */
  readMyDay(id: TaskId): Promise<MyDayRead>;

  /**
   * Replaces the task's My Day entries with `entries`, past ones included as
   * given (ADR 0020); none writes an empty list, the property kept. The user
   * undoes it with one undo. Fails, writing nothing, when the block is not a
   * task, its entries read as unreadable, or the write fails. A mirror
   * block's ID writes to its source block.
   */
  writeMyDay(id: TaskId, entries: MyDayEntries): Promise<void>;

  /**
   * Writes the task's recurrence rule (GLOSSARY: 重复规则), replacing what it
   * holds; `null` removes it, writing no rule with the property kept. The
   * task's other properties and its dates are left as they are. The user
   * undoes it with one undo. Fails, writing nothing, when the block is not a
   * task, its rule reads as unreadable, or the write fails. A mirror block's
   * ID writes to its source block.
   */
  writeRecurrence(id: TaskId, rule: RecurrenceRule | null): Promise<void>;

  /**
   * Writes the task's review plan (GLOSSARY: 回顾周期, 指定回顾日), replacing
   * what it holds; a plan with no fields is written as such, the property
   * kept. The task's other properties are left as they are. The user undoes
   * it with one undo. Fails, writing nothing, when the block is not a task,
   * its review plan reads as unreadable, or the write fails. A mirror block's
   * ID writes to its source block.
   */
  writeReview(id: TaskId, plan: ReviewPlan): Promise<void>;

  /**
   * Writes the task's reminders (GLOSSARY: 提醒), replacing what it holds,
   * ascending and each once; none writes an empty list, the property kept.
   * The task's other properties are left as they are. The user undoes it
   * with one undo. Fails, writing nothing, when the block is not a task, its
   * reminders read as unreadable, or the write fails. A mirror block's ID
   * writes to its source block.
   */
  writeReminders(id: TaskId, reminders: Reminders): Promise<void>;

  /**
   * Discards the task's `data` when this plugin cannot read it, writing its
   * empty value over it: no recurrence rule, a review plan with no fields, no
   * reminders. The one write that overwrites unreadable data, made only when
   * the user asks for it; every other write refuses. Readable data, or none,
   * is left as it is, writing nothing. The user undoes it with one undo.
   * Fails, writing nothing, when the block is not a task or the write fails.
   * A mirror block's ID writes to its source block.
   */
  discardUnreadable(id: TaskId, data: DiscardableData): Promise<void>;

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

  /**
   * The task tag's custom property definitions (GLOSSARY: 自定义属性, ADR
   * 0023) as they are now, in Orca's order. Read afresh on every call, so a
   * property added, renamed, reordered or deleted in Orca shows on the next
   * read (the task change signal follows the edit, ADR 0007).
   */
  readCustomPropertyDefinitions(): Promise<CustomPropertyDefinition[]>;

  /**
   * The text of each of the blocks `ids` (block reference targets, #115),
   * read when asked for. A block that is gone, or deleted while still
   * referenced (left behind as an orphan, tag-operations X2), is not in the
   * result.
   */
  readBlockTexts(ids: readonly number[]): Promise<ReadonlyMap<number, string>>;

  /**
   * Blocks offered as targets of a block reference custom property (#115)
   * whose text holds `search`: only blocks carrying the tag `scope` when
   * given, every block otherwise. Journal blocks and orphans are left out; a
   * mirror reads as its source block, each once.
   */
  searchBlocks(
    search: string,
    scope: string | null,
  ): Promise<readonly BlockCandidate[]>;

  /**
   * Writes one custom property value of a task, an empty value clearing it;
   * the task's other properties are left as they are. A single or multiple
   * choice value's options missing from the property's choices are added to
   * them in the same write (the only change to a definition, ADR 0023). `now` is when it is
   * written (a time of day is stored on that day). The user undoes it with
   * one undo. Fails, writing nothing, with `CustomPropertyChangedError` when
   * the property is no longer defined or its kind is not the value's, or
   * when the block is not a task or the write fails. A mirror block's ID
   * writes to its source block.
   */
  writeCustomProperty(
    id: TaskId,
    name: string,
    value: CustomPropertyValue,
    now: Date,
  ): Promise<void>;
}
