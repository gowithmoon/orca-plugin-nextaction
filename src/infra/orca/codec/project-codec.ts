// Block → Project decoding (#143). Values come from the block's reference to
// the project tag block, as a task's come from its reference to the task tag
// (project-tag): a block with both tags holds two references, each with only
// its own tag's values.
import {
  defaultProjectStatus,
  type Project,
} from "../../../domain/project/project";
import { defaultRating, isRating } from "../../../domain/task/task";
import { textValue } from "./custom-property-codec";
import {
  findProjectPropertyKey,
  findProjectStatusKey,
  type ProjectPropertyKey,
} from "./project-names";
import {
  createdValue,
  dateValue,
  findTaskTagRef,
  isOrphan,
  mirrorSourceId,
  numberValue,
  type RawBlock,
  taskText,
} from "./task-codec";

/** What the codec needs to know about the project tag. */
export interface ProjectTagContext {
  tagBlockId: number;
  /** Properties whose definition conflicts; they read as empty (ADR 0008). */
  invalidated: readonly ProjectPropertyKey[];
}

export type ProjectDecodeResult =
  | { kind: "project"; project: Project }
  | { kind: "not-project"; reason: "untagged" | "orphan" }
  /** A mirror carries no data of its own; read `sourceId` instead. */
  | { kind: "mirror"; sourceId: number };

/** 1–7, or 4 for anything else (GLOSSARY: 重要性, 紧急度). */
function ratingValue(value: unknown) {
  const number = numberValue(value);
  return isRating(number) ? number : defaultRating;
}

/**
 * Reads a project. As a task: a journal block or an orphan is none (ADR
 * 0013), a mirror points at its source. An empty or unknown project status
 * reads as planning (GLOSSARY: 项目状态), with nothing written back.
 */
export function decodeProject(
  block: RawBlock,
  tag: ProjectTagContext,
): ProjectDecodeResult {
  const sourceId = mirrorSourceId(block);
  if (sourceId !== undefined) return { kind: "mirror", sourceId };
  if (isOrphan(block)) return { kind: "not-project", reason: "orphan" };
  const ref = findTaskTagRef(block.refs, tag.tagBlockId);
  if (!ref) return { kind: "not-project", reason: "untagged" };
  const values = new Map<ProjectPropertyKey, unknown>();
  for (const item of ref.data ?? []) {
    const match = findProjectPropertyKey(item.name);
    if (match && !tag.invalidated.includes(match.key)) {
      values.set(match.key, item.value);
    }
  }
  const status = values.get("status");
  return {
    kind: "project",
    project: {
      id: block.id,
      text: taskText(block),
      status:
        (typeof status === "string"
          ? findProjectStatusKey(status)?.key
          : undefined) ?? defaultProjectStatus,
      goal: textValue(values.get("goal")),
      start: dateValue(values.get("start")),
      due: dateValue(values.get("due")),
      importance: ratingValue(values.get("importance")),
      urgency: ratingValue(values.get("urgency")),
      created: createdValue(block.id, block.created),
    },
  };
}
