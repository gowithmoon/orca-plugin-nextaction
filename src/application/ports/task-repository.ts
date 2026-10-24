import type { NoteDropPlan } from "../../domain/blocking/note-drop";
import type { TaskGraphSnapshot } from "../../domain/blocking/task-graph";
import type { MovePlacement } from "../../domain/blocking/task-move";
import type {
  Project,
  ProjectChanges,
  ProjectId,
  ProjectStatus,
} from "../../domain/project/project";
import type { RecurrenceRule } from "../../domain/recurrence/recurrence";
import type { Reminders } from "../../domain/reminder/reminder";
import type { ReviewPlan } from "../../domain/review/review";
import type { CompletionHistory } from "../../domain/task/completion-history";
import type {
  CustomPropertyDefinition,
  CustomPropertyValue,
  CustomPropertyValues,
} from "../../domain/task/custom-property";
import type { MyDayEntries, MyDayRead } from "../../domain/task/my-day";
import type { Task, TaskId, TaskStatus } from "../../domain/task/task";
import type { TaskChanges } from "../../domain/task/task-changes";
import type { NoteCaret } from "./note-cursor";

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
export type DiscardableData =
  | "recurrence"
  | "review"
  | "reminders"
  | "completionHistory";

/** Values a multi-value property (contexts) must or must not hold. */
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
export type ChoiceProperty = "contexts";

/**
 * The values offered: for each multi-value property, and the tags tasks
 * hold (GLOSSARY: 标签), offered by the filters only (#224).
 */
export type Candidates = Record<ChoiceProperty, string[]> & {
  tags: string[];
};

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
 * not given take their defaults: importance, urgency and effort 4, no dates,
 * no 所属项目 (#151). Taken from `TaskChanges`, so the two cannot drift; a new
 * task has nothing to clear, so none is ever `null`.
 */
export type InitialProperties = Pick<
  TaskChanges,
  "importance" | "urgency" | "effort"
> & {
  readonly [K in "start" | "due" | "project"]?: NonNullable<TaskChanges[K]>;
};

/**
 * A block read as part of an outline (#201 读笔记内容为大纲), for the AI to
 * read: its own content as text, without its children's, whether it is a
 * task, and its child blocks in note order. A mirror reads as its source.
 */
export interface OutlineBlock {
  /**
   * Its own content as Markdown-like text, trimmed; empty when it shows
   * nothing of its own (an empty block, a quote whose text is in its
   * children). May span lines (a code block).
   */
  readonly text: string;
  readonly isTask: boolean;
  readonly children: readonly OutlineBlock[];
}

/**
 * Where `createTasks` puts the new tasks: the last child blocks of a block;
 * right after a block, at its level (#204); or at the end of the journal of
 * the calendar day `now` falls on in local time (not the logical day, ADR
 * 0005), created if it does not exist yet (#204).
 */
export type NewTasksPlacement =
  | {
      readonly kind: "lastChild" | "after";
      /** A mirror's ID stands for its source block. */
      readonly blockId: number;
    }
  | { readonly kind: "journal"; readonly now: Date };

/** What a move of a task's block also writes, in the same undo (#222). */
export interface MoveTaskOptions {
  /** The task's own 所属项目 setting is cleared too, a stale one included. */
  readonly clearProject?: boolean;
}

/** One task `createTasks` creates. */
export interface NewTask {
  /** Written as plain text. */
  readonly text: string;
  readonly status: TaskStatus;
  /** As `InitialProperties`; no 所属项目: where it is put decides it. */
  readonly initial?: Omit<InitialProperties, "project">;
}

/**
 * A write to one task (`updateTask`, `updateTasks`). Every part is optional:
 * what is absent is left as it is. The plugin block properties (completion
 * history, recurrence rule, reminders, My Day entries, review plan) are each
 * replaced whole; one this plugin cannot read fails the write, writing
 * nothing (only `discardUnreadable` overwrites it).
 */
export interface TaskWrite {
  readonly id: TaskId;
  /** The properties to write; those absent are left as they are. */
  readonly changes?: TaskChanges;
  /** Replaces the task's completion history. */
  readonly completionHistory?: CompletionHistory;
  /** Replaces the task's recurrence rule, `null` removing it. */
  readonly recurrence?: RecurrenceRule | null;
  /**
   * Replaces the task's reminders (GLOSSARY: 提醒), ascending and each once;
   * an empty list clears them, the property kept.
   */
  readonly reminders?: Reminders;
  /**
   * Replaces the task's My Day entries (GLOSSARY: 我的一天记录), past ones
   * included as given (ADR 0020); an empty list clears them, the property
   * kept.
   */
  readonly myDay?: MyDayEntries;
  /**
   * Replaces the task's review plan (GLOSSARY: 回顾周期, 指定回顾日); a plan
   * with no fields is written as such, the property kept.
   */
  readonly review?: ReviewPlan;
}

/**
 * The block in a note panel a task card was dropped on (#122). Found by
 * `ui` in the note panel under the pointer and used by `infra` to write
 * there; `application` and `domain` pass it on without reading it.
 */
export interface NoteTarget {
  /** The note panel the block shows in; the write goes through it (ADR 0024). */
  readonly panelId: string;
  /** That panel's root block: the journal or page it shows. */
  readonly rootBlockId: number;
  /** The block dropped on, as the panel shows it (a mirror stays a mirror). */
  readonly blockId: number;
  /**
   * Orca's cursor data at the pointer when it lay in the block's text, else
   * `null`. Only `infra` reads it (NoteCursorSource, drag-to-note).
   */
  readonly caret: NoteCaret | null;
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
/**
 * One part of the AI summary as written to the journal (#205): its name and
 * its items, each item one line of Markdown.
 */
export interface JournalSummaryPart {
  readonly heading: string;
  readonly items: readonly string[];
}

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
   * The values to offer, each once, in no particular order: for contexts, the
   * task tag's choices and the values tasks already hold (an invalidated
   * property has none); for tags, the tags tasks hold (#224). All come from
   * one read of the tasks.
   */
  readCandidates(): Promise<Candidates>;

  /**
   * Writes the task as `write` says (`TaskWrite`), leaving what it leaves
   * out as it is. Contexts written are made choices of the task tag first,
   * so they show in the notes and become candidates. The user
   * undoes the whole write with one undo. Fails, writing nothing, when the
   * block is not a task, a property is invalidated, or a plugin block
   * property to be replaced reads as unreadable. A mirror block's ID writes
   * to its source block.
   */
  updateTask(id: TaskId, write: Omit<TaskWrite, "id">): Promise<void>;

  /**
   * Writes several tasks as `updateTask` writes one, each as its `TaskWrite`
   * says. The user undoes every task's write with one undo. Fails, writing
   * nothing at all, when any task's write would fail.
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
   * `initial` properties given, a 所属项目 among them (#151). The user undoes
   * it, properties included, with one undo; a failed write leaves no task.
   * Returns the new task's ID.
   */
  appendTaskToJournal(
    text: string,
    now: Date,
    initial?: InitialProperties,
  ): Promise<TaskId>;

  /**
   * Writes a block `title`, as plain text, at the end of the journal of the
   * calendar day `now` falls on in local time (not the logical day, ADR
   * 0005), creating that journal if it does not exist yet (#205). Below it,
   * in order, a block for each part's `heading`, as plain text, with the
   * part's items, as Markdown list items, as its children; a part with an
   * empty heading puts its items directly below `title`. The whole folds as
   * one block. Tags anywhere are left as text, never created (orca-ai C3,
   * H4). The user undoes it with one undo; a failed write writes nothing.
   */
  appendSummaryToJournal(
    title: string,
    parts: readonly JournalSummaryPart[],
    now: Date,
  ): Promise<void>;

  /**
   * Creates an inbox task with `text`, as plain text, as the last child
   * block of task `parentId` (#190), with the `initial` properties given but
   * no 所属项目: the parent task decides it (GLOSSARY: 所属项目). A mirror
   * block's ID stands for its source block. The user undoes it, properties
   * included, with one undo; a failed write leaves no task. Fails, writing
   * nothing, when the parent is not a task. Returns the new task's ID.
   */
  appendSubtask(
    parentId: TaskId,
    text: string,
    initial?: Omit<InitialProperties, "project">,
  ): Promise<TaskId>;

  /**
   * Creates `tasks` in their order at `placement` (#202), each as plain text
   * with its status and initial properties, and applies `also` (writes to
   * existing tasks, as `updateTasks` does) in the same undo: the user undoes
   * all of it with one undo. Fails, writing nothing, when the placement's
   * block does not exist or a write in `also` would fail. Returns the new
   * tasks' IDs in order.
   */
  createTasks(
    placement: NewTasksPlacement,
    tasks: readonly NewTask[],
    also?: readonly TaskWrite[],
  ): Promise<TaskId[]>;

  /**
   * Block `id` and every block below it as an outline (#201), or `null`
   * when there is no such block. A mirror's ID reads its source block.
   */
  readOutline(id: number): Promise<OutlineBlock | null>;

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
   * Moves the task's block, with every block below it, to the end of project
   * `project`'s block: its last child block (#170), page or block alike. The
   * user undoes it with one undo. A mirror block's ID stands for its source
   * block. Fails, writing nothing, when the block is not a task, `project`
   * is not a project (the project tag paused included), or the write fails.
   * A project block that is the moved block or below it is not checked here:
   * the use case refuses that move first (`checkMove`), and Orca refuses it
   * too (`MovingBlockToSelfOrItsDescendant`, writing nothing,
   * docs/spikes/move-blocks.md), a failed write, as `moveTask`'s.
   */
  moveTaskToProjectEnd(
    id: TaskId,
    project: ProjectId,
    options?: MoveTaskOptions,
  ): Promise<void>;

  /**
   * Moves the task's block, with every block below it, to the end of the
   * journal of the calendar day `now` falls on in local time (not the
   * logical day, ADR 0005), its last child block, creating that journal if
   * it does not exist yet (#222). A page task stays a page and a task. The
   * user undoes it with one undo, the setting cleared with `options`
   * included. A mirror block's ID stands for its source block. Fails,
   * writing nothing, when the block is not a task or the write fails.
   */
  moveTaskToJournal(
    id: TaskId,
    now: Date,
    options?: MoveTaskOptions,
  ): Promise<void>;

  /**
   * Writes a link to the task into the notes at `target`, as `plan` says
   * (#122): a reference at the inline caret, or a new block holding only a
   * reference to the task (#125; mirror blocks come with #126).
   * Written through the target's note panel, so the user undoes it there
   * with one undo (ADR 0024). Changes no task relation (ADR 0003). A mirror
   * block's ID links its source block. Fails when the block is not a task or
   * the write fails.
   */
  linkTaskInNote(
    id: TaskId,
    plan: NoteDropPlan,
    target: NoteTarget,
  ): Promise<void>;

  /**
   * The task tag's custom property definitions (GLOSSARY: 自定义属性, ADR
   * 0023) as they are now, in Orca's order. Read afresh on every call, so a
   * property added, renamed, reordered or deleted in Orca shows on the next
   * read (the task change signal follows the edit, ADR 0007).
   */
  readCustomPropertyDefinitions(): Promise<CustomPropertyDefinition[]>;

  /**
   * As `getTask`, with the custom property definitions its custom property
   * values were read against: one read of them, so the two always agree
   * (the task panel shows a row per definition, #113). `null` when the
   * block is not a task.
   */
  getTaskWithDefinitions(id: TaskId): Promise<{
    task: Task;
    definitions: CustomPropertyDefinition[];
  } | null>;

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
   * Adds a new block as the last target of the block reference custom
   * property `name` of task `id`, as Orca's own property input does for a
   * name it does not find (custom-properties, "块引用新建目标"): a page whose
   * alias and text are `text`, carrying the property's scope tag when it has
   * one. A page already holding the alias `text` is added instead, left as
   * it is. The user undoes it with one undo. Fails, writing nothing, with
   * `CustomPropertyChangedError` when `name` is no longer a block reference
   * property, or when the block is not a task or the write fails. A mirror
   * block's ID writes to its source block.
   */
  addNewBlockRefTarget(id: TaskId, name: string, text: string): Promise<void>;

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

  /**
   * The project with the given block ID (#144), or `null` when that block is
   * not a project (no project tag, an orphan, no such block) or the project
   * tag is paused. A mirror block reads as the project of its source block.
   */
  getProject(id: ProjectId): Promise<Project | null>;

  /**
   * As `getProject`, with the project tag's custom property definitions
   * (GLOSSARY: 自定义属性, ADR 0023) as they are now, in Orca's order, and
   * the project's value of each, read against them in one read (#235). A
   * value whose kind is not its definition's reads as empty. The project
   * tag's definitions and values only: on a block that is also a task, the
   * task tag's stay with the task. `null` as for `getProject`.
   */
  getProjectWithCustomProperties(id: ProjectId): Promise<{
    project: Project;
    definitions: CustomPropertyDefinition[];
    values: CustomPropertyValues;
  } | null>;

  /**
   * The project tag's custom property definitions as they are now, as
   * `readCustomPropertyDefinitions` reads the task tag's. Fails when the
   * project tag is paused.
   */
  readProjectCustomPropertyDefinitions(): Promise<CustomPropertyDefinition[]>;

  /**
   * As `writeCustomProperty`, for a custom property of the project tag on
   * project `id` (#235): written on the reference to the project tag, so the
   * task tag's values on a block with both are left as they are. Fails,
   * writing nothing, with `CustomPropertyChangedError` as it does, or when
   * the block is not a project, the project tag is paused, or the write
   * fails.
   */
  writeProjectCustomProperty(
    id: ProjectId,
    name: string,
    value: CustomPropertyValue,
    now: Date,
  ): Promise<void>;

  /**
   * As `addNewBlockRefTarget`, for a block reference custom property of the
   * project tag on project `id` (#235). Fails as `writeProjectCustomProperty`.
   */
  addNewProjectBlockRefTarget(
    id: ProjectId,
    name: string,
    text: string,
  ): Promise<void>;

  /**
   * Writes the project's project status (#144), and nothing else: the tasks
   * belonging to it are left as they are. The user undoes it with one undo.
   * Fails, writing nothing, when the block is not a project, the project
   * tag is paused, the project status property is invalidated, or the write
   * fails. A mirror block's ID writes to its source block.
   */
  updateProjectStatus(id: ProjectId, status: ProjectStatus): Promise<void>;

  /**
   * Writes the project properties present in `changes` (GLOSSARY: 项目属性面
   * 板, #232), overwriting them, in one undo; the others are left as they
   * are, and so is the task tag's reference on a block with both. Fails,
   * writing nothing, when the block is not a project, the project tag is
   * paused, any of them is invalidated, or the write fails. A mirror block's
   * ID writes to its source block.
   */
  updateProject(id: ProjectId, changes: ProjectChanges): Promise<void>;

  /**
   * Drops the project (GLOSSARY: 放弃项目, #150), in one undo: clears every
   * task's 所属项目 setting that points at it (done tasks' too; found as
   * dependencies on a dropped task are, ADR 0016), drops each of `tasks` as
   * `dropTask` drops one, dependencies on them cleared, and removes the
   * project tag. Which tasks belong to the project is the caller's to work
   * out (ADR 0025); the block itself is never deleted. A mirror block's ID
   * drops its source block. Fails, writing nothing, when the block is not a
   * project, the project tag is paused, one of `tasks` is not a task, or the
   * write fails.
   */
  dropProject(id: ProjectId, tasks: readonly TaskId[]): Promise<void>;
}
