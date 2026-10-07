// TaskRepository on Orca. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { TaskRepository } from "../../../application/ports/task-repository";
import type { Task, TaskId } from "../../../domain/task/task";
import type { Block } from "../../../orca.d.ts";
import { describeError } from "../../../shared/describe-error";
import { decodeTask, type TaskTagContext } from "../codec/task-codec";
import { OrcaError } from "../orca-error";

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
 * @param tag The task tag in use, or `undefined` while task features are
 *   unavailable (the tag could not be set up or was not taken over). Its
 *   `invalidated` list comes from the startup plan (#19).
 */
export function createOrcaTaskRepository(
  tag: () => TaskTagContext | undefined,
): TaskRepository {
  const currentTag = (): TaskTagContext => {
    const context = tag();
    if (!context) throw new OrcaError("the task tag is not available");
    return context;
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
  };
}
