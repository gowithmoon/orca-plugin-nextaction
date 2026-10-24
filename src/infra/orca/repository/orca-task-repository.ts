// TaskRepository on Orca. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import {
  type Candidates,
  type ChoiceProperty,
  type CompletionHistoryRead,
  type ConvertToTaskResult,
  type DiscardableData,
  type InitialProperties,
  type JournalSummaryPart,
  type MoveTaskOptions,
  type NewTask,
  type NewTasksPlacement,
  type NoteTarget,
  type OutlineBlock,
  TaskFeaturesPausedError,
  type TaskFilter,
  type TaskRepository,
  type TaskWrite,
} from "../../../application/ports/task-repository";
import type {
  NoteDropPlacement,
  NoteDropPlan,
} from "../../../domain/blocking/note-drop";
import type { TaskGraphSnapshot } from "../../../domain/blocking/task-graph";
import type { MovePlacement } from "../../../domain/blocking/task-move";
import type { ProjectSetting } from "../../../domain/project/ownership";
import type {
  Project,
  ProjectChanges,
  ProjectId,
  ProjectStatus,
} from "../../../domain/project/project";
import {
  type CustomPropertyDefinition,
  type CustomPropertyValue,
  checkCustomPropertyValue,
} from "../../../domain/task/custom-property";
import type { MyDayRead } from "../../../domain/task/my-day";
import type { Task, TaskId } from "../../../domain/task/task";
import type { TaskChanges } from "../../../domain/task/task-changes";
import type { Block, CursorData } from "../../../orca.d.ts";
import { describeError } from "../../../shared/describe-error";
import {
  planCompletionHistoryDiscard,
  planCompletionHistoryWrite,
  readCompletionHistory,
} from "../codec/completion-history-codec";
import {
  blockCandidates,
  customPropertyDefinitions,
  encodeBlockRefs,
  type IsBuiltInProperty,
  isTaskBuiltInProperty,
  planBlockRefsWrite,
  planCustomChoiceAdditions,
  planCustomPropertyWrite,
  resolveBlockRefTargets,
} from "../codec/custom-property-codec";
import {
  type DependencyWriteItem,
  dependenciesWithout,
  dependentsOf,
  planDependencyWrite,
  planProjectWrite,
} from "../codec/dependency-write";
import { planMyDayWrite } from "../codec/my-day-codec";
import { type PropertyKey, propertyName } from "../codec/names";
import {
  type PluginPropertyWrite,
  pluginPropertyPrefix,
} from "../codec/plugin-block-property-codec";
import {
  encodeProjectSetting,
  projectSettingWithout,
} from "../codec/project-clear";
import {
  decodeProject,
  encodeProjectChanges,
  encodeProjectStatus,
} from "../codec/project-codec";
import {
  planRecurrenceDiscard,
  planRecurrenceWrite,
} from "../codec/recurrence-codec";
import {
  planRemindersDiscard,
  planRemindersWrite,
} from "../codec/reminders-codec";
import { planReviewDiscard, planReviewWrite } from "../codec/review-codec";
import {
  decodeTask,
  findTaskTagRef,
  isOrphan,
  mirrorSourceId,
  projectSettingOf,
  refDataTargets,
  resolveDependencyTargets,
  type TaskTagContext,
  taskText,
} from "../codec/task-codec";
import { planConversion } from "../codec/task-conversion";
import {
  encodeDependencies,
  encodeProject,
  encodeTaskChanges,
  type RefDataItem,
} from "../codec/task-encode";
import { fromNoteCaret } from "../note-cursor-source";
import {
  cachedBlock,
  findAliasOwner,
  invokeBackend,
  invokeEditorCommand,
  invokeEditorCommandAt,
  invokeGroup,
  invokeInNotePanel,
  moveBlocks,
  setCaret,
} from "../orca-calls";
import { OrcaError } from "../orca-error";
import { buildBlockSearchQuery } from "../query/block-search-query";
import { buildProjectQuery } from "../query/project-query";
import { blockIdsFromQueryResult } from "../query/query-result";
import { buildTaskQuery, type TaskTagNames } from "../query/task-query";
import { RefType } from "../ref-type";
import { planChoiceAdditions } from "../schema/choice-plan";
import { choiceName } from "../schema/startup-plan";
import type { PropertyDefinition } from "../schema/tag-schema";
import type { ProjectTagState, TaskTagState } from "../schema/tag-state";
import { readOutline } from "./outline";
import { myDayOf, taskGraphSnapshot } from "./task-graph-snapshot";
import { type HierarchyBlock, missingParents } from "./task-hierarchy";

type ReadyTag = Extract<TaskTagState, { kind: "ready" }>;

/**
 * A tag whose custom properties are read and written (ADR 0023): its block,
 * which holds the definitions and which a block's values hang off the
 * reference to, and which of its properties are built in.
 */
interface CustomPropertyTag {
  tagBlockId: number;
  isBuiltIn: IsBuiltInProperty;
}

const taskPropertyTag = (state: ReadyTag): CustomPropertyTag => ({
  tagBlockId: state.tagBlockId,
  isBuiltIn: isTaskBuiltInProperty,
});

type ChoiceKey = Extract<PropertyKey, "context">;

/** The property each multi-value task field is stored in. */
const choiceKeyOf: Record<ChoiceProperty, ChoiceKey> = {
  contexts: "context",
};
const choiceFields = Object.entries(choiceKeyOf) as [
  ChoiceProperty,
  ChoiceKey,
][];

/**
 * Reads blocks with `get-blocks`, never `orca.state.blocks` (a front-end
 * cache only). What it returns for an unknown ID is not measured, so the
 * result is matched by ID and anything else is ignored.
 */
async function getBlocks(ids: readonly number[]): Promise<Map<number, Block>> {
  const result = await invokeBackend("get-blocks", ids);
  if (!Array.isArray(result)) {
    throw new OrcaError(`get-blocks returned ${JSON.stringify(result)}`);
  }
  const wanted = new Set(ids);
  const blocks = new Map<number, Block>();
  for (const item of result) {
    if (typeof item === "object" && item !== null && "id" in item) {
      const block = item as Block;
      if (wanted.has(block.id)) blocks.set(block.id, block);
    }
  }
  return blocks;
}

/** Block `id` as the backend holds it now, with `get-block`. */
async function fetchBlock(id: number): Promise<Block> {
  const block = await invokeBackend("get-block", id);
  if (typeof block !== "object" || block === null || !("id" in block)) {
    throw new OrcaError(`get-block returned ${JSON.stringify(block)}`);
  }
  return block as Block;
}

/**
 * The journal of `now`'s local date, created when missing, with
 * `get-journal-block` (journal-capture J2, J3).
 */
async function journalBlock(now: Date): Promise<Block> {
  const journal = await invokeBackend("get-journal-block", now);
  if (typeof journal !== "object" || journal === null || !("id" in journal)) {
    throw new OrcaError(
      `get-journal-block returned ${JSON.stringify(journal)}`,
    );
  }
  return journal as Block;
}

/**
 * The children of block `id` as the backend holds them now, for finding the
 * block `batchInsertReprs` added, which it does not return (drag-to-note
 * 写入, as the spike did with `get-block`).
 */
async function childIds(id: number): Promise<number[]> {
  const block = await invokeBackend("get-block", id);
  if (typeof block !== "object" || block === null || !("children" in block)) {
    throw new OrcaError(`get-block returned ${JSON.stringify(block)}`);
  }
  const { children } = block as Block;
  return Array.isArray(children) ? [...children] : [];
}

/**
 * Where the caret goes at the end of `block`'s text, as an index into its
 * content and an offset in that fragment: after the last text fragment's
 * last character, or past a last fragment that is no text (a reference:
 * index 1, offset 0 after a block's only reference, drag-to-note 光标). The
 * text case is not measured; to check by hand in Orca (#126).
 */
function contentEnd(block: Block): { index: number; offset: number } {
  const content = block.content ?? [];
  const last = content.at(-1);
  if (last?.t === "t" && typeof last.v === "string") {
    return { index: content.length - 1, offset: last.v.length };
  }
  return { index: content.length, offset: 0 };
}

/** A collapsed cursor at `at` in the target's note panel. */
function noteCursor(target: NoteTarget, at: CursorData["anchor"]): CursorData {
  return {
    anchor: at,
    focus: at,
    isForward: true,
    panelId: target.panelId,
    rootBlockId: target.rootBlockId,
  };
}

/**
 * A reference to `taskId` at the drop's inline caret, as Orca gave it; one
 * command, one undo. It leaves the caret right after the reference
 * (drag-to-note 写入, 光标).
 */
async function linkInline(taskId: number, target: NoteTarget): Promise<void> {
  if (!target.caret) throw new OrcaError("no inline caret at the drop");
  const given = fromNoteCaret(target.caret);
  // An empty block gives a block-level cursor (drag-to-note 空块); the
  // reference goes at the start of its text, the cursor a new block's
  // reference is written at (measured, drag-to-note 写入).
  const caret = given.anchor.isInline
    ? given
    : noteCursor(target, {
        blockId: given.anchor.blockId,
        isInline: true,
        index: 0,
        offset: 0,
      });
  await invokeInNotePanel(target.panelId, async () => {
    await invokeEditorCommandAt("core.editor.insertLink", caret, true, taskId);
  });
}

/**
 * A new block holding only a reference to `taskId`, then the reference at
 * its start, in one group: one undo (drag-to-note 写入). The caret goes to
 * the new block's end, after the reference, to go on typing there
 * (drag-to-note 光标, round 6).
 */
async function linkInNewRefBlock(
  taskId: number,
  placement: NoteDropPlacement,
  target: NoteTarget,
): Promise<void> {
  await invokeInNotePanel(target.panelId, async () => {
    let created: number | undefined;
    await invokeGroup(async () => {
      const targetBlock = await cachedBlock(target.blockId);
      const id = await invokeEditorCommand(
        "core.editor.insertBlock",
        targetBlock,
        placement,
        [],
      );
      if (typeof id !== "number") {
        throw new OrcaError(`insertBlock returned ${JSON.stringify(id)}`);
      }
      created = id;
      await invokeEditorCommandAt(
        "core.editor.insertLink",
        noteCursor(target, {
          blockId: id,
          isInline: true,
          index: 0,
          offset: 0,
        }),
        true,
        taskId,
      );
    });
    if (created === undefined) return;
    await setCaret(
      noteCursor(target, {
        blockId: created,
        isInline: true,
        index: 1,
        offset: 0,
      }),
    );
  });
}

/**
 * A mirror block of `taskId`: a mirror repr, then its type 5 reference, in
 * one group, as a mirror Orca's interface makes, with no text of its own, so
 * the global search finds the task once. insertBlock with a mirror repr
 * would store the task's text (drag-to-note 写入).
 *
 * The caret then goes to the end of the dropped-on block, never into the
 * new mirror: typing there would change the task (#122 user story 16,
 * drag-to-note 光标, round 6). A root block is its title. When the
 * dropped-on block is a mirror itself, its end is its source's text, so the
 * caret goes to the end of the panel's root block's title instead.
 */
async function linkInMirrorBlock(
  taskId: number,
  placement: NoteDropPlacement,
  target: NoteTarget,
): Promise<void> {
  await invokeInNotePanel(target.panelId, async () => {
    const targetBlock = await cachedBlock(target.blockId);
    await invokeGroup(async () => {
      // The new block's siblings: the target's children for a first child,
      // else its parent's. A root block only takes a first child
      // (resolveNoteDrop).
      const parentId =
        placement === "firstChild" ? targetBlock.id : targetBlock.parent;
      if (parentId === undefined) {
        throw new OrcaError(`block ${targetBlock.id} has no parent`);
      }
      const before = new Set(await childIds(parentId));
      await invokeEditorCommand(
        "core.editor.batchInsertReprs",
        targetBlock,
        placement,
        [{ type: "mirror", mirroredId: taskId }],
      );
      // batchInsertReprs returns no ID: the new block is the child that was
      // not there before (drag-to-note 写入).
      const added = (await childIds(parentId)).filter(
        (child) => !before.has(child),
      );
      const [created] = added;
      if (added.length !== 1 || created === undefined) {
        throw new OrcaError(
          `batchInsertReprs added ${JSON.stringify(added)} under block ${parentId}`,
        );
      }
      await invokeEditorCommand("core.editor.createRef", created, taskId, 5);
    });
    // Neither insert changes the dropped-on block's own content.
    const caretBlock =
      mirrorSourceId(targetBlock) === undefined
        ? targetBlock
        : await cachedBlock(target.rootBlockId);
    await setCaret(
      noteCursor(target, {
        blockId: caretBlock.id,
        isInline: true,
        ...contentEnd(caretBlock),
      }),
    );
  });
}

/**
 * The block an ID stands for: the block itself, or the source block of a
 * mirror (block-properties-json M1–M4: writes through a mirror's ID land on
 * the mirror). One hop only: whether a mirror can show another mirror is not
 * measured, so a second mirror resolves to nothing.
 */
async function sourceBlock(id: number): Promise<Block | undefined> {
  const block = (await getBlocks([id])).get(id);
  if (!block) return undefined;
  const sourceId = mirrorSourceId(block);
  if (sourceId === undefined) return block;
  const source = (await getBlocks([sourceId])).get(sourceId);
  return source && mirrorSourceId(source) === undefined ? source : undefined;
}

/**
 * The property to pass to `setProperties` for a planned plugin block property
 * write. Throws, writing nothing, when the block holds a value this plugin
 * cannot read: it is kept as it is.
 */
function plannedWrite(block: Block, plan: PluginPropertyWrite) {
  if (plan.kind === "refused") {
    console.warn(
      `[nextaction] block ${block.id}: a plugin block property is not overwritten (${plan.reason})`,
      plan.raw,
    );
    throw new OrcaError(
      `a plugin block property of block ${block.id} holds a value this plugin cannot read (${plan.reason})`,
    );
  }
  return plan.property;
}

/** How each discardable data is discarded (`discardUnreadable`). */
const discardPlans = {
  recurrence: planRecurrenceDiscard,
  review: planReviewDiscard,
  reminders: planRemindersDiscard,
  completionHistory: planCompletionHistoryDiscard,
} satisfies Record<DiscardableData, unknown>;

/**
 * The block reference values to write when a project is dropped (#150): for
 * each task among `holders`, its dependencies without those on dropped tasks
 * and its 所属项目 without the project, in one `setRefData` per task. Only
 * the reference IDs each value really holds go (a `type: 3` reference is not
 * always one, next-action-hierarchy-boolean-deps); an invalidated property
 * is left as it is, and so is an unreadable value, with a warning. A block
 * that is not a task is left as it is.
 */
function planDropProjectClears(
  state: ReadyTag,
  context: TaskTagContext,
  holders: ReadonlyMap<number, Block>,
  refs: {
    dependencyRefs: ReadonlyMap<number, ReadonlySet<number>>;
    settingRefs: ReadonlyMap<number, ReadonlySet<number>>;
  },
): { ref: Block["refs"][number]; items: RefDataItem[] }[] {
  const tag = { language: state.language };
  const clears: { ref: Block["refs"][number]; items: RefDataItem[] }[] = [];
  for (const [holderId, holder] of holders) {
    if (decodeTask(holder, context).kind !== "task") continue;
    const dependencyRefIds = refs.dependencyRefs.get(holderId);
    const settingRefIds = refs.settingRefs.get(holderId);
    const removals = [
      dependencyRefIds &&
        !state.invalidated.includes("dependencies") && {
          removal: dependenciesWithout(
            holder,
            state.tagBlockId,
            dependencyRefIds,
          ),
          encode: encodeDependencies,
        },
      settingRefIds &&
        !state.invalidated.includes("project") && {
          removal: projectSettingWithout(
            holder,
            state.tagBlockId,
            settingRefIds,
          ),
          encode: encodeProjectSetting,
        },
    ];
    const items: RefDataItem[] = [];
    for (const entry of removals) {
      if (!entry) continue;
      if (entry.removal.kind === "unreadable") {
        console.warn(
          `[nextaction] block ${holderId}: a block reference value is kept as it is`,
          entry.removal.raw,
        );
      } else if (entry.removal.kind === "write") {
        items.push(entry.encode(entry.removal.refIds, tag));
      }
    }
    const ref = findTaskTagRef(holder.refs, state.tagBlockId);
    if (ref && items.length > 0) clears.push({ ref, items });
  }
  return clears;
}

/**
 * @param tagState Where the task tag stands (#19). While it is paused the
 *   repository neither reads nor writes; when ready, its invalidated
 *   properties read as empty and cannot be written.
 * @param onWritten Called after every write to a task, also a failed one
 *   (what Orca applied is then unknown), so views read again (ADR 0007).
 * @param projectTagState Where the project tag stands (#143). While it is
 *   paused, the task graph holds no project.
 */
export function createOrcaTaskRepository(
  tagState: () => TaskTagState,
  onWritten: (id: TaskId) => void,
  projectTagState: () => ProjectTagState = () => ({
    kind: "paused",
    reason: "starting",
  }),
): TaskRepository {
  const readyTag = () => {
    const state = tagState();
    if (state.kind !== "ready") {
      throw new TaskFeaturesPausedError(
        `task features are paused (${state.reason})`,
      );
    }
    return state;
  };
  /**
   * The project tag's block, left out of a task's tags (#224). While the
   * project tag is starting or failed, the block last known as it, if any;
   * none when refused: that tag was never the plugin's.
   */
  const projectTagBlockId = (): { projectTagBlockId?: number } => {
    const project = projectTagState();
    const id = "tagBlockId" in project ? project.tagBlockId : undefined;
    return id === undefined ? {} : { projectTagBlockId: id };
  };
  /** What every decode of a task is given, so each leaves out both tags. */
  const tagContext = (state: ReadyTag): TaskTagContext => ({
    tagBlockId: state.tagBlockId,
    invalidated: state.invalidated,
    ...projectTagBlockId(),
  });
  const currentTag = (): TaskTagContext => tagContext(readyTag());

  /**
   * A tag's property definitions as the tag block holds them now (ADR
   * 0023). Read on every call rather than kept (ADR 0007), so an edit in
   * Orca shows on the next read; one get-blocks.
   */
  const readTagProperties = async (tag: CustomPropertyTag) => {
    const block = (await getBlocks([tag.tagBlockId])).get(tag.tagBlockId);
    if (!block) {
      throw new OrcaError(`the tag block ${tag.tagBlockId} is gone`);
    }
    return block.properties;
  };
  /** A tag's custom property definitions as they are now. */
  const readDefinitions = async (tag: CustomPropertyTag) =>
    customPropertyDefinitions(await readTagProperties(tag), tag.isBuiltIn);

  /**
   * As `readDefinitions`, for reads: when the tag block cannot be read just
   * now, no custom properties rather than a failed view; writes still check
   * against `readDefinitions` and fail.
   */
  const definitionsForReading = async (
    state: ReadyTag,
  ): Promise<CustomPropertyDefinition[]> => {
    try {
      return await readDefinitions(taskPropertyTag(state));
    } catch (error) {
      console.warn(
        "[nextaction] the task tag's custom properties cannot be read; tasks read without them",
        error,
      );
      return [];
    }
  };

  /**
   * As `currentTag`, with the custom property definitions, for reads. They
   * are read alongside what the caller reads (not before it), so they add
   * no round trip in a row.
   */
  const readingTag = async (
    state: ReadyTag,
    definitions: Promise<CustomPropertyDefinition[]>,
  ): Promise<TaskTagContext> => ({
    ...tagContext(state),
    customProperties: await definitions,
  });

  /**
   * The (source) block of a task, or `undefined` when the ID is not a task:
   * no such block, no task tag, or an orphan.
   */
  const taskBlock = async (id: TaskId, context: TaskTagContext) => {
    const block = await sourceBlock(id);
    return block && decodeTask(block, context).kind === "task"
      ? block
      : undefined;
  };

  /** As `taskBlock`, for writes: a block that is not a task fails the write. */
  const taskBlockToWrite = async (id: TaskId, context: TaskTagContext) => {
    const block = await taskBlock(id, context);
    if (!block) throw new OrcaError(`block ${id} is not a task`);
    return block;
  };

  /**
   * The dependencies values to write so no task depends on `block` once it
   * is dropped (ADR 0016): each task with a `type: 3` reference to it among
   * its `backRefs`, confirmed by its dependencies value holding that
   * reference ID (next-action-hierarchy-boolean-deps). Only tasks are
   * written: a block that is not one (an orphan included) is left as it is.
   * Dependencies on a mirror of the block are not looked for: a mirror's
   * `backRefs` are not measured; they read as stale and go with the next
   * edit of that task's dependencies.
   */
  const planDependencyClears = async (state: ReadyTag, block: Block) => {
    if (state.invalidated.includes("dependencies")) return [];
    const dependents = dependentsOf(block);
    if (dependents.size === 0) return [];
    const context = tagContext(state);
    const blocks = await getBlocks([...dependents.keys()]);
    const clears: { ref: Block["refs"][number]; refIds: number[] }[] = [];
    for (const [dependentId, refIds] of dependents) {
      const dependent = blocks.get(dependentId);
      if (!dependent || decodeTask(dependent, context).kind !== "task") {
        continue;
      }
      const removal = dependenciesWithout(dependent, state.tagBlockId, refIds);
      if (removal.kind === "unreadable") {
        console.warn(
          `[nextaction] block ${dependent.id}: the dependencies value is kept as it is`,
          removal.raw,
        );
        continue;
      }
      const ref = findTaskTagRef(dependent.refs, state.tagBlockId);
      if (removal.kind === "write" && ref) {
        clears.push({ ref, refIds: removal.refIds });
      }
    }
    return clears;
  };

  /** Writes to a task, then reports it written even if the write failed. */
  const writeTo = async (block: Block, write: () => Promise<void>) => {
    try {
      // One undo for everything `write` does.
      await invokeGroup(write);
    } finally {
      onWritten(block.id);
    }
  };

  /**
   * The tasks with every dependency on a mirror read as one on its source
   * (block-properties-json M1). Only targets not in `known` are read: those
   * are task blocks the task query returned, which carry the task tag and so
   * are not mirrors (M2). A target get-blocks does not return stays as it is
   * and reads as stale.
   */
  const withResolvedDependencies = async (
    tasks: Task[],
    known: ReadonlySet<number>,
  ): Promise<Task[]> => {
    const unknown = [
      ...new Set(tasks.flatMap((task) => task.dependencies)),
    ].filter((id) => !known.has(id));
    if (unknown.length === 0) return tasks;
    const targets = await getBlocks(unknown);
    return tasks.map((task) =>
      task.dependencies.some((id) => targets.has(id))
        ? {
            ...task,
            dependencies: resolveDependencyTargets(task.dependencies, targets),
          }
        : task,
    );
  };

  const queryTasks = async (filter: TaskFilter): Promise<Task[]> => {
    const state = readyTag();
    const names: TaskTagNames = {
      tagName: state.tagName,
      language: state.language,
      invalidated: state.invalidated,
    };
    // Built first: a filter on an invalidated property fails before the
    // query runs.
    const query = buildTaskQuery(filter, names);
    const definitions = definitionsForReading(state);
    const ids = blockIdsFromQueryResult(await invokeBackend("query", query));
    if (ids.length === 0) return [];
    const [blocks, context] = await Promise.all([
      getBlocks(ids),
      readingTag(state, definitions),
    ]);
    const tasks: Task[] = [];
    for (const id of ids) {
      const block = blocks.get(id);
      if (!block) continue;
      const decoded = decodeTask(block, context);
      // The query asks for blocks carrying the task tag, so a mirror is not
      // expected among the results (not measured). Should one appear, it is
      // skipped rather than read twice; the orphan condition in the query
      // makes "orphan" equally unexpected here.
      if (decoded.kind === "task") tasks.push(decoded.task);
    }
    return withResolvedDependencies(tasks, new Set(ids));
  };

  /**
   * Every project with its block (#143): the query for the project tag, then
   * get-blocks. None while the project tag is paused: then no task belongs
   * to a project, and task features go on (ADR 0025).
   */
  const readProjects = async (): Promise<{
    projects: Project[];
    blocks: Map<number, Block>;
    paused?: true;
  }> => {
    const state = projectTagState();
    if (state.kind !== "ready") {
      return { projects: [], blocks: new Map(), paused: true };
    }
    const ids = blockIdsFromQueryResult(
      await invokeBackend("query", buildProjectQuery(state.tagName)),
    );
    if (ids.length === 0) return { projects: [], blocks: new Map() };
    const read = await getBlocks(ids);
    const context = {
      tagBlockId: state.tagBlockId,
      invalidated: state.invalidated,
    };
    const projects: Project[] = [];
    const blocks = new Map<number, Block>();
    for (const id of ids) {
      const block = read.get(id);
      if (!block) continue;
      const decoded = decodeProject(block, context);
      // The query asks for blocks carrying the project tag, so a mirror is
      // not among them (project-tag, round 2).
      if (decoded.kind !== "project") continue;
      projects.push(decoded.project);
      blocks.set(id, block);
    }
    return { projects, blocks };
  };

  /**
   * The (source) block of a project with the project decoded (#144), or
   * `undefined` when the ID is not a project or the project tag is paused.
   */
  const projectBlock = async (
    id: ProjectId,
  ): Promise<{ block: Block; project: Project } | undefined> => {
    const state = projectTagState();
    if (state.kind !== "ready") return undefined;
    const block = await sourceBlock(id);
    if (!block) return undefined;
    const decoded = decodeProject(block, {
      tagBlockId: state.tagBlockId,
      invalidated: state.invalidated,
    });
    // sourceBlock never returns a mirror.
    return decoded.kind === "project"
      ? { block, project: decoded.project }
      : undefined;
  };

  /**
   * Every task with its parent task and place in the notes
   * (next-action-hierarchy-boolean-deps): the query for every task, the task
   * blocks with get-blocks, then the ancestors not among them, layer by
   * layer up to the roots; the rest is worked out in memory. About 32 ms for
   * 1000 tasks. get-block-tree is slower and not used.
   */
  const readTaskGraph = async (): Promise<TaskGraphSnapshot> => {
    const state = readyTag();
    const query = buildTaskQuery(
      {},
      {
        tagName: state.tagName,
        language: state.language,
        invalidated: state.invalidated,
      },
    );
    const definitions = definitionsForReading(state);
    // Read alongside the tasks; none while the project tag is paused (#143).
    const projectRead = readProjects();
    const ids = blockIdsFromQueryResult(await invokeBackend("query", query));
    const projectsRead = await projectRead;
    const [blocks, context] = await Promise.all([
      ids.length > 0 ? getBlocks(ids) : new Map<number, Block>(),
      readingTag(state, definitions),
    ]);
    const tasks: Task[] = [];
    /** Each task's own 所属项目 setting, from the block already read (#145). */
    const projectSettings = new Map<number, ProjectSetting>();
    for (const id of ids) {
      const block = blocks.get(id);
      if (!block) continue;
      const decoded = decodeTask(block, context);
      // As in queryTasks: a mirror or an orphan is not expected here.
      if (decoded.kind !== "task") continue;
      tasks.push(decoded.task);
      // None while the project tag is paused: no setting then reads as stale
      // (US103).
      const setting = projectsRead.paused
        ? undefined
        : projectSettingOf(block, context);
      if (setting) projectSettings.set(id, setting);
    }
    // Mirrors among the dependency targets read as their sources, so the
    // task graph sees a dependency on a mirror as one on its task (#57).
    const resolved = await withResolvedDependencies(tasks, new Set(ids));
    const hierarchy = new Map<number, HierarchyBlock>(blocks);
    for (const [id, block] of projectsRead.blocks) hierarchy.set(id, block);
    const asked = new Set<number>([...ids, ...projectsRead.blocks.keys()]);
    for (;;) {
      const layer = missingParents(hierarchy, asked);
      if (layer.length === 0) break;
      for (const id of layer) asked.add(id);
      // A parent get-blocks does not return ends its chain there.
      for (const [id, block] of await getBlocks(layer))
        hierarchy.set(id, block);
    }
    return taskGraphSnapshot({
      tasks: resolved,
      taskBlocks: blocks,
      projects: projectsRead.projects,
      projectBlocks: projectsRead.blocks,
      hierarchy,
      projectSettings,
      ...(projectsRead.paused && { projectsPaused: true }),
    });
  };

  /**
   * The task tag's current definition of contexts, read from the
   * tag block (never from the copies in `ref.data`, tag-operations), or
   * `undefined` when the tag has no such property.
   */
  const tagProperty = async (state: ReadyTag, key: ChoiceKey) => {
    const tag = (await getBlocks([state.tagBlockId])).get(state.tagBlockId);
    if (!tag)
      throw new OrcaError(`the task tag block ${state.tagBlockId} is gone`);
    const name = propertyName(key, state.language);
    return tag.properties.find((p) => p.name === name);
  };

  /** The definitions to write so every context in `changes` is a choice. */
  const planChoiceWrites = async (
    state: ReadyTag,
    changes: TaskChanges,
  ): Promise<PropertyDefinition[]> => {
    const writes: PropertyDefinition[] = [];
    for (const [field, key] of choiceFields) {
      const values = changes[field];
      if (!values || values.length === 0) continue;
      const property = await tagProperty(state, key);
      // Startup alignment adds the property; without it nothing is shown
      // anyway, and a definition is not invented here.
      if (!property) continue;
      const plan = planChoiceAdditions(property, values);
      if (plan.kind === "add") writes.push(plan.definition);
    }
    return writes;
  };

  /**
   * Plans a write to one task: everything is read, encoded and checked
   * before any command runs, so a write that cannot be done fails having
   * written nothing. Returns the block and the commands to run in a group;
   * `undefined` when there is nothing to write.
   */
  const planTaskWrite = async (
    state: ReadyTag,
    write: TaskWrite,
  ): Promise<{ block: Block; run: () => Promise<void> } | undefined> => {
    const changes = write.changes ?? {};
    // Encoded first: an invalidated property fails before anything is read
    // or written.
    const items = encodeTaskChanges(changes, {
      language: state.language,
      invalidated: state.invalidated,
    });
    const block = await taskBlockToWrite(write.id, tagContext(state));
    // The completion history is planned before anything is written: a
    // value this plugin cannot read fails the whole write.
    const properties = [
      ...(write.completionHistory
        ? [
            plannedWrite(
              block,
              planCompletionHistoryWrite(block, write.completionHistory),
            ),
          ]
        : []),
      // The recurrence rule likewise: one that cannot be read is kept.
      ...(write.recurrence !== undefined
        ? [plannedWrite(block, planRecurrenceWrite(block, write.recurrence))]
        : []),
      // The reminders likewise: ones that cannot be read are kept.
      ...(write.reminders !== undefined
        ? [plannedWrite(block, planRemindersWrite(block, write.reminders))]
        : []),
      // The My Day entries likewise.
      ...(write.myDay !== undefined
        ? [plannedWrite(block, planMyDayWrite(block, write.myDay))]
        : []),
      // The review plan likewise.
      ...(write.review !== undefined
        ? [plannedWrite(block, planReviewWrite(block, write.review))]
        : []),
    ];
    // Dependency targets are block IDs coming in: mirrors resolve to their
    // sources first, as every block ID does (block-properties-json M3).
    const dependencyPlan =
      changes.dependencies === undefined
        ? undefined
        : planDependencyWrite(
            block,
            state.tagBlockId,
            changes.dependencies.length === 0
              ? []
              : resolveDependencyTargets(
                  changes.dependencies,
                  await getBlocks(changes.dependencies),
                ),
          );
    // 所属项目 (#146) likewise: one target at most, a mirror resolved to its
    // source; whatever was held, a stale value too, is replaced (ADR 0016).
    const projectTarget =
      changes.project === undefined || changes.project === null
        ? changes.project
        : resolveDependencyTargets(
            [changes.project],
            await getBlocks([changes.project]),
          )[0];
    const projectPlan =
      projectTarget === undefined
        ? undefined
        : planProjectWrite(block, state.tagBlockId, projectTarget);
    if (
      items.length === 0 &&
      properties.length === 0 &&
      dependencyPlan === undefined &&
      projectPlan === undefined
    ) {
      return undefined;
    }
    const ref = findTaskTagRef(block.refs, state.tagBlockId);
    if (!ref) throw new OrcaError(`block ${block.id} lost its task tag`);
    // Values missing from the tag's choices are stored but not shown
    // (multi-choices-created): the whole list is checked every write, so
    // values stored earlier without a choice show again too.
    const choiceWrites = await planChoiceWrites(state, changes);
    const run = async () => {
      // The choices first, in the same group: one undo takes back both
      // (multi-choices-created §3–4).
      if (choiceWrites.length > 0) {
        await invokeEditorCommand(
          "core.editor.setProperties",
          [state.tagBlockId],
          choiceWrites,
        );
      }
      // setRefData takes the whole reference object and changes only the
      // items passed (tag-operations, round 1 steps 05–06).
      if (items.length > 0) {
        await invokeEditorCommand("core.editor.setRefData", ref, items);
      }
      // Dependencies (#57): a reference is created for each new target,
      // then the value is written as reference IDs, never block IDs
      // (tag-operations A2). Reference IDs left out are removed with their
      // references (A4, A5). One group, so one undo.
      if (dependencyPlan !== undefined) {
        await runRefDataWrite(block, state.tagBlockId, dependencyPlan, (ids) =>
          encodeDependencies(ids, { language: state.language }),
        );
      }
      // 所属项目 (#146): written as dependencies are (project-tag).
      if (projectPlan !== undefined) {
        await runRefDataWrite(block, state.tagBlockId, projectPlan, (ids) =>
          encodeProject(ids, { language: state.language }),
        );
      }
      // setProperties replaces a property of the same name and keeps the
      // others (block-properties-json J2).
      if (properties.length > 0) {
        await invokeEditorCommand(
          "core.editor.setProperties",
          [block.id],
          properties,
        );
      }
    };
    return { block, run };
  };

  /**
   * The write clearing task `id`'s own 所属项目 setting when `options` asks
   * for it, planned before anything is written, to run inside a move's
   * group (#222); `undefined` when there is nothing to write.
   */
  const planProjectClear = async (
    id: TaskId,
    options: MoveTaskOptions,
  ): Promise<{ run: () => Promise<void> } | undefined> =>
    options.clearProject
      ? planTaskWrite(readyTag(), { id, changes: { project: null } })
      : undefined;

  /**
   * Runs a block reference write (dependencies #57, a block reference custom
   * property #115) inside a write: a reference created with
   * `createRef(task, target, 3)` for each new target, then the value written
   * as reference IDs, never block IDs (tag-operations A2). Reference IDs left
   * out go with their references (A4, A5).
   */
  const runRefDataWrite = async (
    block: Block,
    tagBlockId: number,
    plan: readonly DependencyWriteItem[],
    encode: (refIds: number[]) => RefDataItem,
  ) => {
    const refIds: number[] = [];
    for (const item of plan) {
      if (item.kind === "existing") {
        refIds.push(item.refId);
        continue;
      }
      const refId = await invokeEditorCommand(
        "core.editor.createRef",
        block.id,
        item.target,
        RefType.RefData,
      );
      if (typeof refId !== "number") {
        throw new OrcaError(`createRef returned ${JSON.stringify(refId)}`);
      }
      refIds.push(refId);
    }
    // The spikes read the block again after createRef before setRefData;
    // done the same here rather than reuse the old ref.
    const current = plan.some((i) => i.kind === "new")
      ? (await getBlocks([block.id])).get(block.id)
      : block;
    const tagRef = current && findTaskTagRef(current.refs, tagBlockId);
    if (!tagRef) throw new OrcaError(`block ${block.id} lost its task tag`);
    await invokeEditorCommand("core.editor.setRefData", tagRef, [
      encode(refIds),
    ]);
  };

  /**
   * The task with the custom property definitions it was decoded with, one
   * read of them, alongside reading the block.
   */
  const getTaskWithDefinitions = async (id: TaskId) => {
    const state = readyTag();
    const definitions = definitionsForReading(state);
    const [block, context] = await Promise.all([
      sourceBlock(id),
      readingTag(state, definitions),
    ]);
    if (!block) return null;
    const decoded = decodeTask(block, context);
    if (decoded.kind !== "task") return null;
    const [resolved] = await withResolvedDependencies(
      [decoded.task],
      new Set(),
    );
    if (!resolved) return null;
    const result = {
      task: resolved,
      definitions: [...(context.customProperties ?? [])],
    };
    // Block reference custom property targets that are mirrors read as
    // their sources too (#115), read only when there are any.
    const targets = Object.values(resolved.customProperties).flatMap((value) =>
      value.kind === "blockRefs" ? value.value : [],
    );
    if (targets.length === 0) return result;
    return {
      ...result,
      task: {
        ...resolved,
        customProperties: resolveBlockRefTargets(
          resolved.customProperties,
          await getBlocks([...new Set(targets)]),
        ),
      },
    };
  };

  /**
   * Writes a block reference custom property (#115) as dependencies are
   * written: a reference created for each new target, then the value as
   * reference IDs, never block IDs (tag-operations A2); reference IDs left
   * out go with their references (A4, A5). Everything is planned first, so a
   * property deleted or changed in Orca fails having written nothing; one
   * group, one undo.
   */
  const writeBlockRefs = async (
    tag: CustomPropertyTag,
    blockToWrite: () => Promise<Block>,
    name: string,
    targets: readonly number[],
  ) => {
    const definitions = await readDefinitions(tag);
    const block = await blockToWrite();
    // Targets are block IDs coming in: mirrors resolve to their sources
    // first, as every block ID does (block-properties-json M3).
    const resolved =
      targets.length === 0
        ? []
        : resolveDependencyTargets(targets, await getBlocks(targets));
    const plan = planBlockRefsWrite(
      definitions,
      block,
      tag.tagBlockId,
      name,
      resolved,
    );
    await writeTo(block, () =>
      runRefDataWrite(block, tag.tagBlockId, plan, (ids) =>
        encodeBlockRefs(name, ids),
      ),
    );
  };

  /**
   * Adds a page named `text` to the block reference custom property `name`
   * of the block `blockToWrite` reads, on the reference to `tag`: the page
   * so named when there is one, else a new one in the property's scope.
   * Checked before anything is created: a property just deleted or changed
   * in Orca fails, writing nothing. One group, one undo.
   */
  const addBlockRefTarget = async (
    tag: CustomPropertyTag,
    blockToWrite: () => Promise<Block>,
    name: string,
    text: string,
  ) => {
    const definitions = await readDefinitions(tag);
    const definition = checkCustomPropertyValue(definitions, name, {
      kind: "blockRefs",
      value: [],
    });
    const scope = definition.kind === "blockRefs" ? definition.scope : null;
    const block = await blockToWrite();
    const held = findTaskTagRef(block.refs, tag.tagBlockId)?.data?.find(
      (d) => d.name === name,
    )?.value;
    const current = refDataTargets(block.refs, held);
    // The name is taken (e.g. a page outside the scope, so not offered):
    // that page is the one meant, left as it is.
    const owner = await findAliasOwner(text);
    await writeTo(block, async () => {
      const target = owner ?? (await createPage(text, scope));
      const plan = planBlockRefsWrite(
        definitions,
        block,
        tag.tagBlockId,
        name,
        [...current, target],
      );
      await runRefDataWrite(block, tag.tagBlockId, plan, (ids) =>
        encodeBlockRefs(name, ids),
      );
    });
  };

  /**
   * Writes the custom property `name` of the block `blockToWrite` reads, on
   * its reference to `tag`; options typed in go into the tag's choices in
   * the same group. Checked against the definitions as they are now: a
   * property just deleted or changed in Orca fails, writing nothing.
   */
  const writeCustomPropertyOf = async (
    tag: CustomPropertyTag,
    blockToWrite: () => Promise<Block>,
    name: string,
    value: CustomPropertyValue,
    now: Date,
  ) => {
    if (value.kind === "blockRefs") {
      await writeBlockRefs(tag, blockToWrite, name, value.value);
      return;
    }
    const tagProperties = await readTagProperties(tag);
    const item = planCustomPropertyWrite(
      customPropertyDefinitions(tagProperties, tag.isBuiltIn),
      name,
      value,
      now,
    );
    // Options typed in go into the property's choices first, or Orca
    // stores them without showing them (multi-choices-created).
    const choiceWrite =
      value.kind === "single" || value.kind === "multi"
        ? planCustomChoiceAdditions(tagProperties, name, value, tag.isBuiltIn)
        : undefined;
    const block = await blockToWrite();
    const ref = findTaskTagRef(block.refs, tag.tagBlockId);
    if (!ref) throw new OrcaError(`block ${block.id} lost its tag`);
    // setRefData takes the whole reference object and changes only the
    // items passed (tag-operations, round 1 steps 05–06).
    await writeTo(block, async () => {
      // The options first, in the same group: one undo takes back both
      // (multi-choices-created §3–4).
      if (choiceWrite) {
        await invokeEditorCommand(
          "core.editor.setProperties",
          [tag.tagBlockId],
          [choiceWrite],
        );
      }
      await invokeEditorCommand("core.editor.setRefData", ref, [item]);
    });
  };

  /**
   * Creates a page named `text`, carrying the tag `scope` when given, as
   * Orca's own block reference input does (custom-properties, "块引用新建目
   * 标"); called inside the write's group, so one undo takes it back. When a
   * step after `insertBlock` fails, the block is deleted again, so no root
   * block without an alias is left behind (tag-operations), as for the tag
   * block (run-startup-plan).
   */
  const createPage = async (text: string, scope: string | null) => {
    const id = await invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      null,
      [{ t: "t", v: text }],
    );
    if (typeof id !== "number") {
      throw new OrcaError(`insertBlock returned ${JSON.stringify(id)}`);
    }
    try {
      // Succeeds with "" (tag-operations); an error object when taken.
      const aliasError = await invokeEditorCommand(
        "core.editor.createAlias",
        text,
        id,
      );
      if (aliasError) {
        throw new OrcaError(
          `createAlias "${text}" failed: ${JSON.stringify(aliasError)}`,
        );
      }
      if (scope !== null) {
        await invokeEditorCommand("core.editor.insertTag", id, scope);
      }
    } catch (error) {
      try {
        await invokeEditorCommand("core.editor.deleteBlocks", [id]);
      } catch (cleanup) {
        throw new OrcaError(
          `${describeError(error)}; deleting the new block ${id} also failed: ${describeError(cleanup)}`,
        );
      }
      throw error;
    }
    return id;
  };

  return {
    async readBlockTexts(ids) {
      const texts = new Map<number, string>();
      if (ids.length === 0) return texts;
      // A block deleted while still referenced stays as an orphan
      // (tag-operations X2): it reads as deleted, as a missing one does.
      for (const [blockId, block] of await getBlocks(ids)) {
        if (!isOrphan(block)) texts.set(blockId, taskText(block));
      }
      return texts;
    },

    async searchBlocks(search, scope) {
      const query = buildBlockSearchQuery(search, scope);
      if (!query) return [];
      const ids = blockIdsFromQueryResult(await invokeBackend("query", query));
      if (ids.length === 0) return [];
      const found = await getBlocks(ids);
      const ordered = ids.flatMap((blockId) => {
        const block = found.get(blockId);
        return block ? [block] : [];
      });
      // Mirrors read as their sources (block-properties-json M1).
      const sourceIds = ordered
        .map((block) => mirrorSourceId(block))
        .filter((sourceId): sourceId is number => sourceId !== undefined)
        .filter((sourceId) => !found.has(sourceId));
      const sources = new Map(found);
      if (sourceIds.length > 0) {
        for (const [sourceId, block] of await getBlocks(sourceIds)) {
          sources.set(sourceId, block);
        }
      }
      return blockCandidates(ordered, sources);
    },

    async readCandidates(): Promise<Candidates> {
      const state = readyTag();
      const candidates: Candidates = { contexts: [], tags: [] };
      const live = choiceFields.filter(
        // An invalidated property reads as empty everywhere (ADR 0008).
        ([, key]) => !state.invalidated.includes(key),
      );
      const values = new Map<ChoiceProperty, Set<string>>();
      for (const [field, key] of live) {
        const property = await tagProperty(state, key);
        const choices: unknown[] = Array.isArray(property?.typeArgs?.choices)
          ? property.typeArgs.choices
          : [];
        const names = new Set<string>();
        for (const choice of choices) {
          const name = choiceName(choice);
          if (typeof name === "string" && name !== "") names.add(name);
        }
        values.set(field, names);
      }
      // Values tasks hold without a choice (e.g. written before #41) count
      // too, and tags are only those tasks hold (#224), not every tag in
      // the notes. Every task is read once for all: about 70 ms for 1000
      // tasks (ADR 0007).
      const tags = new Set<string>();
      for (const task of await queryTasks({})) {
        for (const [field, names] of values) {
          for (const value of task[field]) names.add(value);
        }
        for (const tag of task.tags) tags.add(tag);
      }
      for (const [field, names] of values) candidates[field] = [...names];
      candidates.tags = [...tags];
      return candidates;
    },

    async getTask(id: TaskId): Promise<Task | null> {
      return (await getTaskWithDefinitions(id))?.task ?? null;
    },

    getTaskWithDefinitions,

    async updateTask(id: TaskId, write: Omit<TaskWrite, "id">): Promise<void> {
      // Mirrors resolve to their source blocks (block-properties-json M3).
      const plan = await planTaskWrite(readyTag(), { ...write, id });
      // One group, one undo; setProperties replaces a property of the same
      // name and keeps the others (block-properties-json J2).
      if (plan) await writeTo(plan.block, plan.run);
    },

    async updateTasks(writes: readonly TaskWrite[]): Promise<void> {
      const state = readyTag();
      // Every task is planned before anything is written: one that cannot be
      // written fails them all, writing nothing.
      const plans: NonNullable<Awaited<ReturnType<typeof planTaskWrite>>>[] =
        [];
      for (const write of writes) {
        const plan = await planTaskWrite(state, write);
        if (plan) plans.push(plan);
      }
      if (plans.length === 0) return;
      try {
        // One group for every task, so one undo, from a note panel or the
        // plugin panel alike; the order of the blocks does not matter
        // (docs/spikes/multi-block-undo, M1–M3). The task advanced comes
        // first, as `writes` is ordered.
        await invokeGroup(async () => {
          for (const plan of plans) await plan.run();
        });
      } finally {
        for (const plan of plans) onWritten(plan.block.id);
      }
    },

    async readCompletionHistory(id: TaskId): Promise<CompletionHistoryRead> {
      // Only tagged blocks: what a dropped task left behind is not task data
      // (block-properties-json J4).
      const block = await taskBlock(id, currentTag());
      if (!block) return { kind: "readable", history: [] };
      const read = readCompletionHistory(block);
      if (read.kind === "unreadable") {
        console.warn(
          `[nextaction] block ${block.id}: the completion history is kept as it is (${read.reason})`,
          read.raw,
        );
        return { kind: "unreadable", reason: read.reason };
      }
      return read;
    },

    async readMyDay(id: TaskId): Promise<MyDayRead> {
      // Only tagged blocks, as for the completion history: what a dropped
      // task left behind is not task data (block-properties-json J4).
      const block = await taskBlock(id, currentTag());
      if (!block) return { kind: "readable", entries: [] };
      const read = myDayOf(block);
      if (read?.kind === "unreadable") {
        console.warn(
          `[nextaction] block ${block.id}: the My Day entries are kept as they are (${read.reason})`,
        );
      }
      return read ?? { kind: "readable", entries: [] };
    },

    async discardUnreadable(id: TaskId, data: DiscardableData): Promise<void> {
      // Mirrors resolve to their source blocks (block-properties-json M3).
      const block = await taskBlockToWrite(id, currentTag());
      const plan = discardPlans[data](block);
      // Readable, or none: nothing to discard, nothing written.
      if (plan.kind === "nothing") return;
      console.warn(
        `[nextaction] block ${block.id}: an unreadable plugin block property is discarded at the user's request`,
        block.properties.find((p) => p.name === plan.property.name)?.value,
      );
      // As for the other plugin block properties: one setProperties in one
      // group, one undo.
      await writeTo(block, async () => {
        await invokeEditorCommand(
          "core.editor.setProperties",
          [block.id],
          [plan.property],
        );
      });
    },

    async convertToTask(id: number): Promise<ConvertToTaskResult> {
      const state = readyTag();
      // Mirrors resolve first: tagging a mirror puts hidden task data on it
      // (block-properties-json M4).
      const block = await sourceBlock(id);
      if (!block) throw new OrcaError(`no block ${id} to convert`);
      // Decided before any call into Orca: insertTag on a journal block
      // fails inside Orca (page-task P1).
      const plan = planConversion(block, tagContext(state));
      switch (plan.kind) {
        case "already-task":
          return { kind: "already-task", id: block.id };
        case "not-convertible":
          return { kind: "not-convertible", reason: plan.reason };
        case "mirror":
          // sourceBlock never returns a mirror.
          throw new OrcaError(`block ${block.id} is a mirror of a mirror`);
        case "convertible":
          await writeTo(block, async () => {
            // Removing the task tag in Orca leaves plugin block properties
            // behind (block-properties-json J4); a new task starts blank.
            // deleteProperties deletes by name, dotted names included (J7).
            if (plan.leftoverProperties.length > 0) {
              await invokeEditorCommand(
                "core.editor.deleteProperties",
                [block.id],
                plan.leftoverProperties,
              );
            }
            // Without values every property takes its default, the status
            // inbox (tag-operations).
            await invokeEditorCommand(
              "core.editor.insertTag",
              block.id,
              state.tagName,
            );
          });
          return { kind: "converted", id: block.id };
      }
    },

    async dropTask(id: TaskId): Promise<void> {
      const state = readyTag();
      const block = await taskBlockToWrite(id, tagContext(state));
      const pluginProperties = block.properties
        .map((p) => p.name)
        .filter((name) => name.startsWith(pluginPropertyPrefix));
      const dependencyClears = await planDependencyClears(state, block);
      // removeTag leaves plugin block properties behind (block-properties-json
      // J4), so both happen in one undo; so does clearing every dependency
      // on the task (ADR 0016), done first as the spike did
      // (next-action-hierarchy-boolean-deps).
      await writeTo(block, async () => {
        for (const { ref, refIds } of dependencyClears) {
          // setRefData takes the whole reference object and changes only the
          // items passed; reference IDs left out go with their references,
          // `[]` removes the value (tag-operations A4, A5).
          await invokeEditorCommand("core.editor.setRefData", ref, [
            encodeDependencies(refIds, { language: state.language }),
          ]);
        }
        await invokeEditorCommand(
          "core.editor.removeTag",
          block.id,
          state.tagName,
        );
        if (pluginProperties.length > 0) {
          await invokeEditorCommand(
            "core.editor.deleteProperties",
            [block.id],
            pluginProperties,
          );
        }
      });
    },

    async appendTaskToJournal(
      text: string,
      now: Date,
      initial: InitialProperties = {},
    ): Promise<TaskId> {
      const state = readyTag();
      // Encoded first: an invalidated property fails before anything is
      // written. Only the properties given; Orca fills the others with their
      // defaults (inbox-anomalous-status).
      const items = encodeTaskChanges(initial, {
        language: state.language,
        invalidated: state.invalidated,
      });
      // 所属项目 (#151): not in `items`, as insertTag cannot write a block
      // reference value (project-tag); a mirror resolved to its source first,
      // as every block ID is (block-properties-json M3).
      const projectTarget =
        initial.project === undefined
          ? undefined
          : resolveDependencyTargets(
              [initial.project],
              await getBlocks([initial.project]),
            )[0];
      // A local-time Date picks the journal by local date, and a missing
      // journal is created (journal-capture J2, J3). This runs outside the
      // group below, so a journal it creates is not removed by the one undo;
      // accepted (journal-capture).
      const journal = await journalBlock(now);
      let id: unknown;
      try {
        // insertBlock and insertTag in one group are one undo (J4, J6); a
        // journal fetched with get-block works as the reference (J5).
        await invokeGroup(async () => {
          id = await invokeEditorCommand(
            "core.editor.insertBlock",
            journal,
            "lastChild",
            // Plain text: tags and formatting in it are not parsed.
            [{ t: "t", v: text }],
          );
          if (typeof id !== "number") {
            throw new OrcaError(`insertBlock returned ${JSON.stringify(id)}`);
          }
          // Values not passed take their defaults, the status inbox; dates
          // go in as for setRefData (tag-operations step 02, date-subtype D).
          await invokeEditorCommand(
            "core.editor.insertTag",
            id,
            state.tagName,
            ...(items.length > 0 ? [items] : []),
          );
          // Then 所属项目 in the same group, written as the task panel writes
          // it: insertBlock, insertTag, createRef and setRefData are one
          // undo (project-tag, round 2).
          if (projectTarget !== undefined) {
            const created = (await getBlocks([id])).get(id);
            if (!created) throw new OrcaError(`block ${id} was not created`);
            await runRefDataWrite(
              created,
              state.tagBlockId,
              planProjectWrite(created, state.tagBlockId, projectTarget),
              (ids) => encodeProject(ids, { language: state.language }),
            );
          }
        });
      } finally {
        if (typeof id === "number") onWritten(id);
      }
      // The group completed, so insertBlock returned a number; checked again
      // because TypeScript cannot see the assignment inside the callback.
      if (typeof id !== "number") {
        throw new OrcaError(`insertBlock returned ${JSON.stringify(id)}`);
      }
      return id;
    },

    async appendSummaryToJournal(
      title: string,
      parts: readonly JournalSummaryPart[],
      now: Date,
    ): Promise<void> {
      // As appendTaskToJournal: the journal by local date, created when
      // missing, before the group below, so a journal it creates is not
      // removed by the one undo (journal-capture J2, J3).
      const journal = await journalBlock(now);
      const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ");
      const inserted = (id: unknown): number => {
        if (typeof id !== "number") {
          throw new OrcaError(`insertBlock returned ${JSON.stringify(id)}`);
        }
        return id;
      };
      // As measured (orca-ai H4), in one group, one undo: the title as the
      // journal's last child; the first part's block as the title's last
      // child, each next one after the part before; each part's items as
      // its block's children with batchInsertText, Markdown parsed and tags
      // not extracted. The reference is fetched afresh with get-block before
      // each write: lastChild of one parent object again and again puts
      // them in reverse (F1). A fetched block needs no cache (C2).
      await invokeGroup(async () => {
        const top = inserted(
          await invokeEditorCommand(
            "core.editor.insertBlock",
            journal,
            "lastChild",
            // Plain text: tags and formatting in it are not parsed.
            [{ t: "t", v: oneLine(title) }],
          ),
        );
        let previousPart: number | undefined;
        for (const part of parts) {
          // A part with no name puts its items straight below the title, as
          // its last children: written in order, they stay in order.
          let under = top;
          if (part.heading !== "") {
            under = inserted(
              await invokeEditorCommand(
                "core.editor.insertBlock",
                await fetchBlock(previousPart ?? top),
                previousPart === undefined ? "lastChild" : "after",
                [{ t: "t", v: oneLine(part.heading) }],
              ),
            );
            previousPart = under;
          }
          if (part.items.length === 0) continue;
          await invokeEditorCommand(
            "core.editor.batchInsertText",
            await fetchBlock(under),
            "lastChild",
            part.items.map((item) => `- ${oneLine(item)}`).join("\n"),
            // Markdown parsed; tags not extracted (orca-ai C3, H4).
            false,
            true,
          );
        }
      });
    },

    async appendSubtask(
      parentId: TaskId,
      text: string,
      initial: Omit<InitialProperties, "project"> = {},
    ): Promise<TaskId> {
      const state = readyTag();
      // As appendTaskToJournal: encoded first, only the properties given.
      const items = encodeTaskChanges(initial, {
        language: state.language,
        invalidated: state.invalidated,
      });
      // The source block for a mirror's ID (block-properties-json M3).
      const parent = await taskBlockToWrite(parentId, currentTag());
      let id: unknown;
      try {
        // insertBlock and insertTag in one group are one undo, as in
        // appendTaskToJournal (J4, J6). The parent goes in through the
        // cache, as blocks placed next to a block want it (move-blocks).
        await invokeGroup(async () => {
          id = await invokeEditorCommand(
            "core.editor.insertBlock",
            await cachedBlock(parent.id),
            "lastChild",
            // Plain text: tags and formatting in it are not parsed.
            [{ t: "t", v: text }],
          );
          if (typeof id !== "number") {
            throw new OrcaError(`insertBlock returned ${JSON.stringify(id)}`);
          }
          await invokeEditorCommand(
            "core.editor.insertTag",
            id,
            state.tagName,
            ...(items.length > 0 ? [items] : []),
          );
        });
      } finally {
        if (typeof id === "number") onWritten(id);
      }
      if (typeof id !== "number") {
        throw new OrcaError(`insertBlock returned ${JSON.stringify(id)}`);
      }
      return id;
    },

    async moveTask(
      id: TaskId,
      target: TaskId,
      placement: MovePlacement,
    ): Promise<void> {
      const context = currentTag();
      // Mirrors resolve to their source blocks, moved and target alike.
      const block = await taskBlockToWrite(id, context);
      const targetBlock = await taskBlockToWrite(target, context);
      // One command, one undo step (move-blocks U1); the moved block's
      // children go with it.
      await writeTo(block, () =>
        moveBlocks(block.id, targetBlock.id, placement),
      );
    },

    async moveTaskToProjectEnd(
      id: TaskId,
      project: ProjectId,
      options: MoveTaskOptions = {},
    ): Promise<void> {
      // A mirror resolves to its source block; the project's block is a
      // source block itself (projectBlock).
      const block = await taskBlockToWrite(id, currentTag());
      const read = await projectBlock(project);
      if (!read) throw new OrcaError(`block ${project} is not a project`);
      const clear = await planProjectClear(id, options);
      // The project block's last child block, page or block alike
      // (project-board A1–A3); moveBlocks fetches it first (move-blocks 64e).
      // The setting cleared in the same group: one undo (move-blocks U2,
      // multi-block-undo; the pair checked by hand in Orca, #222).
      await writeTo(block, async () => {
        await clear?.run();
        await moveBlocks(block.id, read.block.id, "lastChild");
      });
    },

    async moveTaskToJournal(
      id: TaskId,
      now: Date,
      options: MoveTaskOptions = {},
    ): Promise<void> {
      // A mirror resolves to its source block.
      const block = await taskBlockToWrite(id, currentTag());
      const clear = await planProjectClear(id, options);
      // As appendTaskToJournal: the journal by local date, created when
      // missing (journal-capture J2, J3), outside the group below, so a
      // journal it creates is not removed by the one undo.
      const journal = await journalBlock(now);
      // Its last child block; moveBlocks puts the journal in the cache first
      // when it is not there, else the block would land at the root
      // (move-blocks 64d, 64e). The children go with it (64a U1); a page
      // stays a page and a task (64a P1). One group with the setting
      // cleared: one undo (64a U2, multi-block-undo; checked by hand, #222).
      await writeTo(block, async () => {
        await clear?.run();
        await moveBlocks(block.id, journal.id, "lastChild");
      });
    },

    async linkTaskInNote(
      id: TaskId,
      plan: NoteDropPlan,
      target: NoteTarget,
    ): Promise<void> {
      // A mirror's ID links its source block, so the link points at the task.
      const block = await taskBlockToWrite(id, currentTag());
      try {
        if (plan.kind === "inline") {
          await linkInline(block.id, target);
        } else if (plan.content === "mirror") {
          await linkInMirrorBlock(block.id, plan.placement, target);
        } else {
          await linkInNewRefBlock(block.id, plan.placement, target);
        }
      } finally {
        // The task gained a reference; views read again (ADR 0007).
        onWritten(block.id);
      }
    },

    async createTasks(
      placement: NewTasksPlacement,
      tasks: readonly NewTask[],
      also: readonly TaskWrite[] = [],
    ): Promise<TaskId[]> {
      const state = readyTag();
      // Encoded and planned first: an invalidated property or a write in
      // `also` that cannot be done fails before anything is written.
      const encoded = tasks.map((task) =>
        encodeTaskChanges(
          { ...task.initial, status: task.status },
          { language: state.language, invalidated: state.invalidated },
        ),
      );
      const plans: NonNullable<Awaited<ReturnType<typeof planTaskWrite>>>[] =
        [];
      for (const write of also) {
        const plan = await planTaskWrite(state, write);
        if (plan) plans.push(plan);
      }
      // The block the new tasks go relative to: a mirror's ID stands for its
      // source block (block-properties-json M3); a journal is picked by
      // local date and created when missing (journal-capture J2, J3), outside
      // the group below, so a journal it creates is not removed by the one
      // undo, as in appendTaskToJournal.
      let anchorId: number;
      if (placement.kind === "journal") {
        anchorId = (await journalBlock(placement.now)).id;
      } else {
        const anchor = await sourceBlock(placement.blockId);
        if (!anchor) throw new OrcaError(`block ${placement.blockId} is gone`);
        anchorId = anchor.id;
      }
      // Indexes into `tasks` in the order they are inserted: right after the
      // anchor, the last first, so they end up in order (orca-ai C1).
      const order = [...tasks.keys()];
      if (placement.kind === "after") order.reverse();
      const created = new Map<number, number>();
      try {
        // One group: one undo for every task and every write in `also`
        // (orca-ai C1, F1; multi-block-undo).
        await invokeGroup(async () => {
          let previous: number | undefined;
          for (const index of order) {
            const task = tasks[index] as NewTask;
            // After a block: each one right after it (C1). As the last
            // child blocks (of a block or a journal): the first as the last
            // child, each next one right after the one before, the reference
            // fetched afresh each time: lastChild of one parent object again
            // and again puts them in reverse (F1). A fetched block needs no
            // cache (C2).
            const after = placement.kind === "after" || previous !== undefined;
            const reference = await fetchBlock(
              placement.kind === "after" ? anchorId : (previous ?? anchorId),
            );
            const id = await invokeEditorCommand(
              "core.editor.insertBlock",
              reference,
              after ? "after" : "lastChild",
              // Plain text: tags and formatting in it are not parsed.
              [{ t: "t", v: task.text }],
            );
            if (typeof id !== "number") {
              throw new OrcaError(`insertBlock returned ${JSON.stringify(id)}`);
            }
            created.set(index, id);
            previous = id;
            // The status and initial values go in with the tag (orca-ai F1).
            await invokeEditorCommand(
              "core.editor.insertTag",
              id,
              state.tagName,
              encoded[index] ?? [],
            );
          }
          for (const plan of plans) await plan.run();
        });
      } finally {
        for (const id of created.values()) onWritten(id);
        for (const plan of plans) onWritten(plan.block.id);
      }
      // In the order of `tasks`, whatever order they went in.
      return [...tasks.keys()].map((index) => created.get(index) as number);
    },

    async readOutline(id: number): Promise<OutlineBlock | null> {
      const block = await sourceBlock(id);
      if (!block) return null;
      return readOutline(block, currentTag());
    },

    async readCustomPropertyDefinitions() {
      return readDefinitions(taskPropertyTag(readyTag()));
    },

    async addNewBlockRefTarget(id, name, text) {
      await addBlockRefTarget(
        taskPropertyTag(readyTag()),
        () => taskBlockToWrite(id, currentTag()),
        name,
        text,
      );
    },

    async writeCustomProperty(
      id: TaskId,
      name: string,
      value: CustomPropertyValue,
      now: Date,
    ): Promise<void> {
      await writeCustomPropertyOf(
        taskPropertyTag(readyTag()),
        () => taskBlockToWrite(id, currentTag()),
        name,
        value,
        now,
      );
    },

    async getProject(id: ProjectId): Promise<Project | null> {
      return (await projectBlock(id))?.project ?? null;
    },

    async updateProjectStatus(
      id: ProjectId,
      status: ProjectStatus,
    ): Promise<void> {
      const state = projectTagState();
      if (state.kind !== "ready") {
        throw new OrcaError(`projects are paused (${state.reason})`);
      }
      // Encoded first: an invalidated project status fails before any read.
      const item = encodeProjectStatus(status, state);
      const read = await projectBlock(id);
      if (!read) throw new OrcaError(`block ${id} is not a project`);
      const ref = findTaskTagRef(read.block.refs, state.tagBlockId);
      if (!ref) throw new OrcaError(`block ${id} lost its project tag`);
      // As a task status: setRefData on the reference to the project tag
      // changes only the item passed, in one group, one undo; the task tag's
      // reference on a block with both is left as it is (project-tag).
      await writeTo(read.block, async () => {
        await invokeEditorCommand("core.editor.setRefData", ref, [item]);
      });
    },

    async updateProject(id: ProjectId, changes: ProjectChanges): Promise<void> {
      const state = projectTagState();
      if (state.kind !== "ready") {
        throw new OrcaError(`projects are paused (${state.reason})`);
      }
      // Encoded first: an invalidated property fails before any read.
      const items = encodeProjectChanges(changes, state);
      if (items.length === 0) return;
      const read = await projectBlock(id);
      if (!read) throw new OrcaError(`block ${id} is not a project`);
      const ref = findTaskTagRef(read.block.refs, state.tagBlockId);
      if (!ref) throw new OrcaError(`block ${id} lost its project tag`);
      // As updateProjectStatus: only the items passed change, on the
      // reference to the project tag, in one group, one undo.
      await writeTo(read.block, async () => {
        await invokeEditorCommand("core.editor.setRefData", ref, items);
      });
    },

    async dropProject(id: ProjectId, taskIds: readonly TaskId[]) {
      const state = readyTag();
      const projectState = projectTagState();
      if (projectState.kind !== "ready") {
        throw new OrcaError(`projects are paused (${projectState.reason})`);
      }
      const read = await projectBlock(id);
      if (!read) throw new OrcaError(`block ${id} is not a project`);
      const context = tagContext(state);
      // The IDs come from the task graph: source blocks carrying the task tag.
      const taskBlocks = await getBlocks(taskIds);
      const dropped: Block[] = [];
      for (const taskId of taskIds) {
        const block = taskBlocks.get(taskId);
        if (!block || decodeTask(block, context).kind !== "task") {
          throw new OrcaError(`block ${taskId} is not a task`);
        }
        dropped.push(block);
      }
      const droppedIds = new Set(taskIds);
      // Found as dependents of a dropped task are (ADR 0016, project-tag):
      // `type: 3` references among the backRefs, each confirmed below
      // against the value it should be in.
      const dependencyRefs = new Map<number, Set<number>>();
      for (const block of dropped) {
        for (const [from, refIds] of dependentsOf(block)) {
          // A dropped task's own task tag goes, its dependencies with it.
          if (droppedIds.has(from)) continue;
          const merged = dependencyRefs.get(from) ?? new Set<number>();
          for (const refId of refIds) merged.add(refId);
          dependencyRefs.set(from, merged);
        }
      }
      // Every setting pointing at it, those of tasks dropped with it and of
      // done tasks too (GLOSSARY: 放弃项目), cleared before tags go, as the
      // spike did (project-tag round 2).
      const settingRefs = dependentsOf(read.block);
      const holders = await getBlocks([
        ...new Set([...dependencyRefs.keys(), ...settingRefs.keys()]),
      ]);
      const clears = planDropProjectClears(state, context, holders, {
        dependencyRefs,
        settingRefs,
      });
      const written = new Set<number>([read.block.id, ...droppedIds]);
      for (const { ref } of clears) written.add(ref.from);
      try {
        // One group, one undo for all of it (project-tag round 2).
        await invokeGroup(async () => {
          for (const { ref, items } of clears) {
            await invokeEditorCommand("core.editor.setRefData", ref, items);
          }
          // As dropTask: removeTag leaves plugin block properties behind
          // (block-properties-json J4).
          for (const block of dropped) {
            await invokeEditorCommand(
              "core.editor.removeTag",
              block.id,
              state.tagName,
            );
            const pluginProperties = block.properties
              .map((p) => p.name)
              .filter((name) => name.startsWith(pluginPropertyPrefix));
            if (pluginProperties.length > 0) {
              await invokeEditorCommand(
                "core.editor.deleteProperties",
                [block.id],
                pluginProperties,
              );
            }
          }
          await invokeEditorCommand(
            "core.editor.removeTag",
            read.block.id,
            projectState.tagName,
          );
        });
      } finally {
        for (const writtenId of written) onWritten(writtenId);
      }
    },

    queryTasks,
    readTaskGraph,
  };
}
