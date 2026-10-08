// Can a block be converted to a task (GLOSSARY: 转为任务, ADR 0013)? Decided
// before any call into Orca: `insertTag` on a journal block fails inside Orca
// (page-task P1).
import type { NotConvertibleReason } from "../../../application/ports/task-repository";
import { pluginPropertyPrefix } from "./plugin-block-property-codec";
import { decodeTask, type RawBlock, type TaskTagContext } from "./task-codec";

export type ConversionPlan =
  /**
   * Tag it. `leftoverProperties` are plugin block properties left behind
   * when the task tag was removed in Orca; delete them first.
   */
  | { kind: "convertible"; leftoverProperties: string[] }
  /** Already a task: nothing is written. */
  | { kind: "already-task" }
  | { kind: "not-convertible"; reason: NotConvertibleReason }
  /** A mirror carries no task data of its own; plan for `sourceId` instead. */
  | { kind: "mirror"; sourceId: number };

export function planConversion(
  block: RawBlock,
  tag: TaskTagContext,
): ConversionPlan {
  // The tag block is a page (root level, with an alias), so it is checked
  // before the "no parent, no alias" rule.
  if (block.id === tag.tagBlockId) {
    return { kind: "not-convertible", reason: "task-tag" };
  }
  const decoded = decodeTask(block, tag);
  switch (decoded.kind) {
    case "mirror":
      return decoded;
    case "task":
      return { kind: "already-task" };
    case "not-task":
      if (decoded.reason === "orphan") {
        return { kind: "not-convertible", reason: "journal-or-orphan" };
      }
      return {
        kind: "convertible",
        leftoverProperties: block.properties
          .map((p) => p.name)
          .filter((name) => name.startsWith(pluginPropertyPrefix)),
      };
  }
}
