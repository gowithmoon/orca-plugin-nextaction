// TaskRepository on Orca. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import {
  type Candidates,
  type ChoiceProperty,
  type CompletionHistoryRead,
  type ConvertToTaskResult,
  type DiscardableData,
  type InitialProperties,
  type NoteTarget,
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
  ProjectId,
  ProjectStatus,
} from "../../../domain/project/project";
import {
  lastCompletion as lastCompletionIn,
  lastSkip as lastSkipIn,
} from "../../../domain/task/completion-history";
import type {
  CustomPropertyDefinition,
  CustomPropertyValue,
} from "../../../domain/task/custom-property";
import type { MyDayRead } from "../../../domain/task/my-day";
import type { Task, TaskId } from "../../../domain/task/task";
import type { TaskChanges } from "../../../domain/task/task-changes";
import type { Block, CursorData } from "../../../orca.d.ts";
import {
  planCompletionHistoryWrite,
  readCompletionHistory,
} from "../codec/completion-history-codec";
import {
  blockCandidates,
  customPropertyDefinitions,
  encodeBlockRefs,
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
} from "../codec/dependency-write";
import { planMyDayWrite, readMyDay } from "../codec/my-day-codec";
import { type PropertyKey, propertyName } from "../codec/names";
import {
  type PluginPropertyWrite,
  pluginPropertyPrefix,
} from "../codec/plugin-block-property-codec";
import { decodeProject, encodeProjectStatus } from "../codec/project-codec";
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
  resolveDependencyTargets,
  type TaskTagContext,
  taskText,
} from "../codec/task-codec";
import { planConversion } from "../codec/task-conversion";
import {
  encodeDependencies,
  encodeTaskChanges,
  type RefDataItem,
} from "../codec/task-encode";
import { fromNoteCaret } from "../note-cursor-source";
import {
  cachedBlock,
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
import {
  type HierarchyBlock,
  missingParents,
  placeTasks,
} from "./task-hierarchy";

type ReadyTag = Extract<TaskTagState, { kind: "ready" }>;
type ChoiceKey = Extract<PropertyKey, "context" | "label">;

/** The property each multi-value task field is stored in. */
const choiceKeyOf: Record<ChoiceProperty, ChoiceKey> = {
  contexts: "context",
  labels: "label",
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
} satisfies Record<DiscardableData, unknown>;

/**
 * A block's My Day entries as the port reads them; `undefined` when it holds
 * none, so a snapshot task carries nothing.
 */
function myDayOf(block: Block): MyDayRead | undefined {
  const read = readMyDay(block);
  if (read.kind === "unreadable") {
    return { kind: "unreadable", reason: read.reason };
  }
  return read.entries.length > 0 ? read : undefined;
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
  const currentTag = (): TaskTagContext => {
    const state = readyTag();
    return { tagBlockId: state.tagBlockId, invalidated: state.invalidated };
  };

  /**
   * The task tag's custom property definitions as the tag block holds them
   * now (ADR 0023). Read on every call rather than kept (ADR 0007), so an
   * edit in Orca shows on the next read; one get-blocks.
   */
  const readTagProperties = async (state: ReadyTag) => {
    const tag = (await getBlocks([state.tagBlockId])).get(state.tagBlockId);
    if (!tag) {
      throw new OrcaError(`the task tag block ${state.tagBlockId} is gone`);
    }
    return tag.properties;
  };
  const readDefinitions = async (state: ReadyTag) =>
    customPropertyDefinitions(await readTagProperties(state));

  /**
   * As `readDefinitions`, for reads: when the tag block cannot be read just
   * now, no custom properties rather than a failed view; writes still check
   * against `readDefinitions` and fail.
   */
  const definitionsForReading = async (
    state: ReadyTag,
  ): Promise<CustomPropertyDefinition[]> => {
    try {
      return await readDefinitions(state);
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
    tagBlockId: state.tagBlockId,
    invalidated: state.invalidated,
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
    const context: TaskTagContext = {
      tagBlockId: state.tagBlockId,
      invalidated: state.invalidated,
    };
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
  }> => {
    const state = projectTagState();
    if (state.kind !== "ready") return { projects: [], blocks: new Map() };
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
    if (ids.length === 0) {
      return {
        tasks: [],
        projects: projectsRead.projects.map((project) => ({
          project,
          position: 0,
          ...(projectsRead.blocks.get(project.id)?.aliases.length && {
            page: true,
          }),
        })),
      };
    }
    const [blocks, context] = await Promise.all([
      getBlocks(ids),
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
      const setting = projectSettingOf(block, context);
      if (setting) projectSettings.set(id, setting);
    }
    // Mirrors among the dependency targets read as their sources, so the
    // task graph sees a dependency on a mirror as one on its task (#57).
    const resolved = await withResolvedDependencies(tasks, new Set(ids));
    tasks.splice(0, tasks.length, ...resolved);
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
    const places = placeTasks(
      tasks.map((task) => task.id),
      hierarchy,
      projectsRead.projects.map((project) => project.id),
    );
    return {
      projects: projectsRead.projects.map((project) => {
        const block = projectsRead.blocks.get(project.id);
        return {
          project,
          position: places.get(project.id)?.position ?? Number.MAX_SAFE_INTEGER,
          ...(block && block.aliases.length > 0 && { page: true }),
        };
      }),
      tasks: tasks.map((task) => {
        const place = places.get(task.id);
        // The last completion (skips passed over, #91), from the block already
        // read. An unreadable history reads as none here, without a warning
        // on every read; it is reported where it is read for writing
        // (readCompletionHistory).
        const block = blocks.get(task.id);
        const history = block ? readCompletionHistory(block) : undefined;
        const lastCompletion =
          history?.kind === "readable"
            ? lastCompletionIn(history.history)
            : undefined;
        const lastSkip =
          history?.kind === "readable"
            ? lastSkipIn(history.history)
            : undefined;
        // The My Day entries, from the same block. Unreadable ones are marked
        // so, without a warning on every read; readMyDay warns when they are
        // read by ID.
        const myDay = block ? myDayOf(block) : undefined;
        return {
          task,
          parentId: place?.parentId ?? null,
          position: place?.position ?? Number.MAX_SAFE_INTEGER,
          ...(lastCompletion && { lastCompletion }),
          ...(lastSkip && { lastSkip }),
          // The whole history, for the review's look back (#102).
          ...(history?.kind === "readable" &&
            history.history.length > 0 && {
              completionHistory: history.history,
            }),
          ...(myDay && { myDay }),
          // A page has an alias; with no parent block it sits at the top of
          // the notes, where only pages are tasks (ADR 0013, move-blocks P2).
          ...(block && block.aliases.length > 0 && { page: true }),
          ...(block && block.parent == null && { root: true }),
          ...(place?.projectBlock !== undefined && {
            projectBlock: place.projectBlock,
          }),
          // Stale or not, as read; the task graph decides whether it counts.
          ...(projectSettings.has(task.id) && {
            projectSetting: projectSettings.get(task.id),
          }),
        };
      }),
    };
  };

  /**
   * The task tag's current definition of contexts or labels, read from the
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

  /** The definitions to write so every context and label in `changes` is a choice. */
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
    const block = await taskBlockToWrite(write.id, {
      tagBlockId: state.tagBlockId,
      invalidated: state.invalidated,
    });
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
    if (
      items.length === 0 &&
      properties.length === 0 &&
      dependencyPlan === undefined
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
    state: ReadyTag,
    id: TaskId,
    name: string,
    targets: readonly number[],
  ) => {
    const definitions = await readDefinitions(state);
    const block = await taskBlockToWrite(id, currentTag());
    // Targets are block IDs coming in: mirrors resolve to their sources
    // first, as every block ID does (block-properties-json M3).
    const resolved =
      targets.length === 0
        ? []
        : resolveDependencyTargets(targets, await getBlocks(targets));
    const plan = planBlockRefsWrite(
      definitions,
      block,
      state.tagBlockId,
      name,
      resolved,
    );
    await writeTo(block, () =>
      runRefDataWrite(block, state.tagBlockId, plan, (ids) =>
        encodeBlockRefs(name, ids),
      ),
    );
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
      const candidates: Candidates = { contexts: [], labels: [] };
      const live = choiceFields.filter(
        // An invalidated property reads as empty everywhere (ADR 0008).
        ([, key]) => !state.invalidated.includes(key),
      );
      if (live.length === 0) return candidates;
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
      // too. Every task is read once for both: about 70 ms for 1000 tasks
      // (ADR 0007).
      for (const task of await queryTasks({})) {
        for (const [field, names] of values) {
          for (const value of task[field]) names.add(value);
        }
      }
      for (const [field, names] of values) candidates[field] = [...names];
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
      const plan = planConversion(block, {
        tagBlockId: state.tagBlockId,
        invalidated: state.invalidated,
      });
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
      const block = await taskBlockToWrite(id, {
        tagBlockId: state.tagBlockId,
        invalidated: state.invalidated,
      });
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
      // A local-time Date picks the journal by local date, and a missing
      // journal is created (journal-capture J2, J3). This runs outside the
      // group below, so a journal it creates is not removed by the one undo;
      // accepted (journal-capture).
      const journal = await invokeBackend("get-journal-block", now);
      if (
        typeof journal !== "object" ||
        journal === null ||
        !("id" in journal)
      ) {
        throw new OrcaError(
          `get-journal-block returned ${JSON.stringify(journal)}`,
        );
      }
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

    async readCustomPropertyDefinitions() {
      return readDefinitions(readyTag());
    },

    async writeCustomProperty(
      id: TaskId,
      name: string,
      value: CustomPropertyValue,
      now: Date,
    ): Promise<void> {
      const state = readyTag();
      if (value.kind === "blockRefs") {
        await writeBlockRefs(state, id, name, value.value);
        return;
      }
      const tagProperties = await readTagProperties(state);
      // Checked against the definitions as they are now: a property just
      // deleted or changed in Orca fails, writing nothing.
      const item = planCustomPropertyWrite(
        customPropertyDefinitions(tagProperties),
        name,
        value,
        now,
      );
      // Options typed in go into the property's choices first, or Orca
      // stores them without showing them (multi-choices-created).
      const choiceWrite =
        value.kind === "single" || value.kind === "multi"
          ? planCustomChoiceAdditions(tagProperties, name, value)
          : undefined;
      const block = await taskBlockToWrite(id, currentTag());
      const ref = findTaskTagRef(block.refs, state.tagBlockId);
      if (!ref) throw new OrcaError(`block ${block.id} lost its task tag`);
      // setRefData takes the whole reference object and changes only the
      // items passed (tag-operations, round 1 steps 05–06).
      await writeTo(block, async () => {
        // The options first, in the same group: one undo takes back both
        // (multi-choices-created §3–4).
        if (choiceWrite) {
          await invokeEditorCommand(
            "core.editor.setProperties",
            [state.tagBlockId],
            [choiceWrite],
          );
        }
        await invokeEditorCommand("core.editor.setRefData", ref, [item]);
      });
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

    queryTasks,
    readTaskGraph,
  };
}
