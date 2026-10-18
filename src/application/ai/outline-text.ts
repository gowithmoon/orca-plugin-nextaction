// An outline as the AI reads it (#201 读笔记内容为大纲): one line per block,
// indented by depth. Pure.
import type { OutlineBlock } from "../ports/task-repository";

/** What marks a block that is a task already (#201: `[已是任务]`). */
export const alreadyTaskMarker = "[already a task]";

/** Text that starts as a Markdown list item already ("- a", "1. a", "- [ ] a"). */
const listItem = /^(?:[-*+]|\d+\.)\s/;

/**
 * `blocks` and everything below them as an indented list, two spaces a
 * level. A block with no text of its own takes no line; its children keep
 * their depth. A task's line starts with `alreadyTaskMarker`. A block's
 * further lines (a code block) are indented as its first. Empty when no
 * block has any text.
 */
export function outlineText(blocks: readonly OutlineBlock[]): string {
  const lines: string[] = [];
  const walk = (block: OutlineBlock, depth: number) => {
    const indent = "  ".repeat(depth);
    if (block.text !== "") {
      const text = block.isTask
        ? `${alreadyTaskMarker} ${block.text}`
        : block.text;
      const [first = "", ...rest] = text.split("\n");
      lines.push(
        `${indent}${listItem.test(first) ? "" : "- "}${first}`,
        ...rest.map((line) => `${indent}  ${line}`),
      );
    }
    for (const child of block.children) walk(child, depth + 1);
  };
  for (const block of blocks) walk(block, 0);
  return lines.join("\n");
}

/** `blocks` without the blocks that are tasks, and everything below those. */
export function withoutTasks(
  blocks: readonly OutlineBlock[],
): readonly OutlineBlock[] {
  return blocks
    .filter((block) => !block.isTask)
    .map((block) => ({ ...block, children: withoutTasks(block.children) }));
}
