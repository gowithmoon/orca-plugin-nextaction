// A block and everything below it read as an outline for the AI (#201 读笔记
// 内容为大纲, orca-ai B, E, G). Each block's own content is converted alone
// (never the whole tree, which loses the levels and the task tags; never the
// `text` field, which holds the tags and every property value). Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import type { OutlineBlock } from "../../../application/ports/task-repository";
import type { Block, Repr } from "../../../orca.d.ts";
import { describeError } from "../../../shared/describe-error";
import {
  decodeTask,
  mirrorSourceId,
  type TaskTagContext,
} from "../codec/task-codec";
import { cachedBlock, invokeBackend } from "../orca-calls";
import { OrcaError } from "../orca-error";

/** The blocks below `root`, as `get-block-tree` gives them (root left out, E7). */
async function descendants(root: Block): Promise<Map<number, Block>> {
  const tree = await invokeBackend("get-block-tree", root.id);
  if (!Array.isArray(tree)) {
    throw new OrcaError(`get-block-tree returned ${JSON.stringify(tree)}`);
  }
  const blocks = new Map<number, Block>();
  for (const item of tree) {
    if (typeof item === "object" && item !== null && "id" in item) {
      blocks.set((item as Block).id, item as Block);
    }
  }
  return blocks;
}

/**
 * Block `id` from the cache, fetched and put there when missing, for the
 * converter: an inline reference's target, or a mirror's source, missing
 * there converts to nothing (G3). One that cannot be read is left out with
 * a warning; the reference's text is lost, nothing else.
 */
async function cacheForConversion(id: number): Promise<Block | undefined> {
  try {
    return await cachedBlock(id);
  } catch (error) {
    console.warn(
      `[nextaction] block ${id} could not be read for the AI: ${describeError(error)}`,
    );
    return undefined;
  }
}

/** The block's `_repr`, as the converter takes it. */
function reprOf(block: Block): Repr {
  const repr = block.properties.find((p) => p.name === "_repr")?.value;
  return typeof repr === "object" && repr !== null
    ? (repr as Repr)
    : { type: "text" };
}

/**
 * The block's own content as Markdown, trimmed (E, G). A quote whose text is
 * in its children converts to `>` alone: empty here.
 */
async function ownText(block: Block): Promise<string> {
  for (const fragment of block.content ?? []) {
    // An inline reference (`t: "r"`) to the block `v` (G4).
    if (fragment.t === "r" && typeof fragment.v === "number") {
      await cacheForConversion(fragment.v);
    }
  }
  let converted: string;
  try {
    converted = await orca.converters.blockConvert(
      "markdown",
      { content: block.content ?? [] },
      reprOf(block),
      block,
      true,
      { exportRootId: block.id },
    );
  } catch (error) {
    throw new OrcaError(
      `block ${block.id} could not be converted: ${describeError(error)}`,
    );
  }
  const text = converted.trim();
  return text === ">" ? "" : text;
}

/**
 * Block `root` (a source block) and everything below it as an outline, each
 * block marked when it is a task. A mirror below it reads as its source's
 * content, a task when its source is one; the source goes into the cache for
 * the converter (G5).
 */
export async function readOutline(
  root: Block,
  tag: TaskTagContext,
): Promise<OutlineBlock> {
  const below = await descendants(root);
  const read = async (block: Block): Promise<OutlineBlock> => {
    const sourceId = mirrorSourceId(block);
    const source =
      sourceId === undefined ? block : await cacheForConversion(sourceId);
    const isTask =
      source !== undefined && decodeTask(source, tag).kind === "task";
    const children: OutlineBlock[] = [];
    // In note order, as the parent holds them.
    for (const childId of block.children ?? []) {
      const child = below.get(childId);
      if (child) children.push(await read(child));
    }
    return { text: await ownText(block), isTask, children };
  };
  return read(root);
}
