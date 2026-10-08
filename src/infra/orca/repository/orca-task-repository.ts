// TaskRepository on Orca. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import {
  type ConvertToTaskResult,
  type PluginBlockPropertyRead,
  type PluginBlockPropertyWrites,
  TaskFeaturesPausedError,
  type TaskFilter,
  type TaskRepository,
} from "../../../application/ports/task-repository";
import type { Task, TaskId } from "../../../domain/task/task";
import type { TaskChanges } from "../../../domain/task/task-changes";
import type { Block } from "../../../orca.d.ts";
import {
  planPluginPropertyWrite,
  pluginPropertyPrefix,
  readPluginProperty,
} from "../codec/plugin-block-property-codec";
import {
  decodeTask,
  findTaskTagRef,
  mirrorSourceId,
  type TaskTagContext,
} from "../codec/task-codec";
import { planConversion } from "../codec/task-conversion";
import { encodeTaskChanges } from "../codec/task-encode";
import { invokeBackend, invokeEditorCommand, invokeGroup } from "../orca-calls";
import { OrcaError } from "../orca-error";
import { blockIdsFromQueryResult } from "../query/query-result";
import { buildTaskQuery, type TaskTagNames } from "../query/task-query";
import type { TaskTagState } from "../schema/task-tag-state";

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
 * The property to pass to `setProperties` for writing `data` to the plugin
 * block property `key`. Throws, writing nothing, when the block holds a value
 * this plugin cannot read: it is kept as it is.
 */
function planPluginBlockPropertyWrite(
  block: Block,
  key: string,
  data: Readonly<Record<string, unknown>>,
) {
  const plan = planPluginPropertyWrite(block, key, { ...data });
  if (plan.kind === "refused") {
    console.warn(
      `[nextaction] block ${block.id}: plugin block property "${key}" is not overwritten (${plan.reason})`,
      plan.raw,
    );
    throw new OrcaError(
      `plugin block property "${key}" of block ${block.id} holds a value this plugin cannot read (${plan.reason})`,
    );
  }
  return plan.property;
}

/**
 * @param tagState Where the task tag stands (#19). While it is paused the
 *   repository neither reads nor writes; when ready, its invalidated
 *   properties read as empty and cannot be written.
 * @param onWritten Called after every write to a task, also a failed one
 *   (what Orca applied is then unknown), so caches drop what they hold for
 *   it. Views connect to it in step 4.
 */
export function createOrcaTaskRepository(
  tagState: () => TaskTagState,
  onWritten: (id: TaskId) => void,
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

  /** Writes to a task, then reports it written even if the write failed. */
  const writeTo = async (block: Block, write: () => Promise<void>) => {
    try {
      // One undo for everything `write` does.
      await invokeGroup(write);
    } finally {
      onWritten(block.id);
    }
  };

  return {
    async getTask(id: TaskId): Promise<Task | null> {
      const context = currentTag();
      const block = await sourceBlock(id);
      if (!block) return null;
      const decoded = decodeTask(block, context);
      return decoded.kind === "task" ? decoded.task : null;
    },

    async updateTask(
      id: TaskId,
      changes: TaskChanges,
      pluginBlockProperties: PluginBlockPropertyWrites = {},
    ): Promise<void> {
      const state = readyTag();
      // Encoded first: an invalidated property fails before anything is read
      // or written.
      const items = encodeTaskChanges(changes, {
        language: state.language,
        invalidated: state.invalidated,
      });
      const block = await taskBlockToWrite(id, {
        tagBlockId: state.tagBlockId,
        invalidated: state.invalidated,
      });
      // Every plugin block property is planned before anything is written: a
      // value this plugin cannot read fails the whole write.
      const properties = Object.entries(pluginBlockProperties).map(
        ([key, data]) => planPluginBlockPropertyWrite(block, key, data),
      );
      if (items.length === 0 && properties.length === 0) return;
      const ref = findTaskTagRef(block.refs, state.tagBlockId);
      if (!ref) throw new OrcaError(`block ${block.id} lost its task tag`);
      await writeTo(block, async () => {
        // setRefData takes the whole reference object and changes only the
        // items passed (tag-operations, round 1 steps 05–06).
        if (items.length > 0) {
          await invokeEditorCommand("core.editor.setRefData", ref, items);
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
      });
    },

    async readPluginBlockProperty(
      id: TaskId,
      key: string,
    ): Promise<PluginBlockPropertyRead> {
      // Only tagged blocks: what a dropped task left behind is not task data
      // (block-properties-json J4).
      const block = await taskBlock(id, currentTag());
      if (!block) return { kind: "absent" };
      const read = readPluginProperty(block, key);
      if (read.kind === "unreadable") {
        console.warn(
          `[nextaction] block ${block.id}: plugin block property "${key}" is kept as it is (${read.reason})`,
          read.raw,
        );
        return { kind: "unreadable", reason: read.reason };
      }
      return read;
    },

    async writePluginBlockProperty(
      id: TaskId,
      key: string,
      data: Readonly<Record<string, unknown>>,
    ): Promise<void> {
      const block = await taskBlockToWrite(id, currentTag());
      const property = planPluginBlockPropertyWrite(block, key, data);
      // setProperties replaces a property of the same name and keeps the
      // others (block-properties-json J2).
      await writeTo(block, async () => {
        await invokeEditorCommand(
          "core.editor.setProperties",
          [block.id],
          [property],
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
      // removeTag leaves plugin block properties behind (block-properties-json
      // J4), so both happen in one undo.
      await writeTo(block, async () => {
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

    async appendTaskToJournal(text: string, now: Date): Promise<TaskId> {
      const state = readyTag();
      // A local-time Date picks the journal by local date, and a missing
      // journal is created (journal-capture J2, J3).
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
          // Without values every property takes its default, the status
          // inbox (tag-operations).
          await invokeEditorCommand("core.editor.insertTag", id, state.tagName);
        });
      } finally {
        if (typeof id === "number") onWritten(id);
      }
      return id as TaskId;
    },

    async queryTasks(filter: TaskFilter): Promise<Task[]> {
      const state = readyTag();
      const names: TaskTagNames = {
        tagName: state.tagName,
        language: state.language,
        invalidated: state.invalidated,
      };
      const context: TaskTagContext = {
        tagBlockId: state.tagBlockId,
        invalidated: state.invalidated,
      };
      // Built first: a filter on an invalidated property fails before the
      // query runs.
      const query = buildTaskQuery(filter, names);
      const ids = blockIdsFromQueryResult(await invokeBackend("query", query));
      if (ids.length === 0) return [];
      const blocks = await getBlocks(ids);
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
      return tasks;
    },
  };
}
