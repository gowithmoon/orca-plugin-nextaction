// TaskRepository on Orca. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type {
  TaskFilter,
  TaskRepository,
} from "../../../application/ports/task-repository";
import type { Task, TaskId } from "../../../domain/task/task";
import type { Block } from "../../../orca.d.ts";
import { describeError } from "../../../shared/describe-error";
import { decodeTask, type TaskTagContext } from "../codec/task-codec";
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
  let result: unknown;
  try {
    result = await orca.invokeBackend("get-blocks", ids);
  } catch (error) {
    throw new OrcaError(`get-blocks failed: ${describeError(error)}`);
  }
  if (!Array.isArray(result)) {
    throw new OrcaError(`get-blocks returned ${JSON.stringify(result)}`);
  }
  const blocks = new Map<number, Block>();
  for (const item of result) {
    if (typeof item === "object" && item !== null && "id" in item) {
      const block = item as Block;
      if (ids.includes(block.id)) blocks.set(block.id, block);
    }
  }
  return blocks;
}

/**
 * @param tagState Where the task tag stands (#19). While it is paused the
 *   repository reads nothing; when ready, its invalidated properties read as
 *   empty.
 */
export function createOrcaTaskRepository(
  tagState: () => TaskTagState,
): TaskRepository {
  const readyTag = () => {
    const state = tagState();
    if (state.kind !== "ready") {
      throw new OrcaError(`task features are paused (${state.reason})`);
    }
    return state;
  };
  const currentTag = (): TaskTagContext => {
    const state = readyTag();
    return { tagBlockId: state.tagBlockId, invalidated: state.invalidated };
  };

  return {
    async getTask(id: TaskId): Promise<Task | null> {
      const context = currentTag();
      const block = (await getBlocks([id])).get(id);
      if (!block) return null;
      const decoded = decodeTask(block, context);
      switch (decoded.kind) {
        case "task":
          return decoded.task;
        case "not-task":
          return null;
        case "mirror": {
          // One hop only: whether a mirror can show another mirror is not
          // measured, so a second mirror reads as not a task.
          const source = (await getBlocks([decoded.sourceId])).get(
            decoded.sourceId,
          );
          if (!source) return null;
          const resolved = decodeTask(source, context);
          return resolved.kind === "task" ? resolved.task : null;
        }
      }
    },

    async queryTasks(filter: TaskFilter): Promise<Task[]> {
      const state = readyTag();
      const names: TaskTagNames = {
        tagName: state.tagName,
        language: state.language,
      };
      const context: TaskTagContext = {
        tagBlockId: state.tagBlockId,
        invalidated: state.invalidated,
      };
      let result: unknown;
      try {
        result = await orca.invokeBackend(
          "query",
          buildTaskQuery(filter, names),
        );
      } catch (error) {
        throw new OrcaError(`query failed: ${describeError(error)}`);
      }
      const ids = blockIdsFromQueryResult(result);
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
