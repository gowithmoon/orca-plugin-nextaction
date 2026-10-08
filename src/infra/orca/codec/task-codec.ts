// Block → Task decoding. Values come from the task block's reference to the
// task tag block (tag-operations): `refs[]` with `type === 2` and `to` equal
// to the tag block ID, its `data` holding one item per property.

import {
  type CalendarDate,
  type Task,
  taskFromNotes,
} from "../../../domain/task/task";
import { findPropertyKey, findStatusKey, type PropertyKey } from "./names";

/** What the codec needs to know about the task tag. */
export interface TaskTagContext {
  tagBlockId: number;
  /** Plugin properties whose definition conflicts; they read as empty (#19). */
  invalidated: readonly PropertyKey[];
}

/**
 * Why a block is not a task: it lacks the task tag, or it is an orphan left
 * behind when a referenced block was deleted (tag-operations, round 5).
 */
export type NotTaskReason = "untagged" | "orphan";

export type DecodeResult =
  | { kind: "task"; task: Task }
  | { kind: "not-task"; reason: NotTaskReason }
  /** A mirror carries no task data of its own; read `sourceId` instead. */
  | { kind: "mirror"; sourceId: number };

/**
 * A block as `get-blocks` returns it, limited to what decoding reads. Orca's
 * `Block` type is assignable to it; it is looser because real blocks hold
 * `null` where `Block` says the field is optional (`parent`, tag-operations).
 */
export interface RawBlock {
  id: number;
  /**
   * A Date, as get-blocks returns it (multi-choices-created); checked all the
   * same, as it orders the inbox (`createdValue`).
   */
  created: unknown;
  parent?: number | null;
  aliases: readonly string[];
  content?: readonly { t: string; v: unknown }[] | null;
  properties: readonly { name: string; value?: unknown }[];
  refs: readonly {
    type: number;
    to: number;
    data?: readonly { name: string; value?: unknown }[] | null;
  }[];
}

/** The block's `_repr` value, if it has one. */
function reprOf(block: Pick<RawBlock, "properties">): Record<string, unknown> {
  const repr = block.properties.find((p) => p.name === "_repr")?.value;
  return typeof repr === "object" && repr !== null
    ? (repr as Record<string, unknown>)
    : {};
}

/**
 * The block a mirror shows (`_repr: { type: "mirror", mirroredId }`,
 * block-properties-json M1), or `undefined` for any other block.
 */
export function mirrorSourceId(
  block: Pick<RawBlock, "properties">,
): number | undefined {
  const repr = reprOf(block);
  return repr.type === "mirror" && typeof repr.mirroredId === "number"
    ? repr.mirroredId
    : undefined;
}

/**
 * A block with neither a parent nor an alias (ADR 0013): one deleted while
 * still referenced (tag-operations, rounds 4–5), which keeps its task tag, or
 * a journal block (page-task P1). A page has no parent but has an alias, so
 * it can be a task. Reading by ID agrees with the task query’s "has a parent
 * or an alias" (page-task P2).
 */
function isOrphan(block: RawBlock): boolean {
  return block.parent == null && block.aliases.length === 0;
}

/** Orca `RefType.Property`: a tag reference (plugin-docs/constants/db.md). */
const propertyRef = 2;

/** The block's reference to the task tag, which holds the task's values. */
export function findTaskTagRef<R extends RawBlock["refs"][number]>(
  refs: readonly R[],
  tagBlockId: number,
): R | undefined {
  return refs.find((r) => r.type === propertyRef && r.to === tagBlockId);
}

export function decodeTask(block: RawBlock, tag: TaskTagContext): DecodeResult {
  const sourceId = mirrorSourceId(block);
  if (sourceId !== undefined) return { kind: "mirror", sourceId };
  if (isOrphan(block)) return { kind: "not-task", reason: "orphan" };
  const ref = findTaskTagRef(block.refs, tag.tagBlockId);
  if (!ref) return { kind: "not-task", reason: "untagged" };
  const values = new Map<PropertyKey, unknown>();
  for (const item of ref.data ?? []) {
    const match = findPropertyKey(item.name);
    if (match && !tag.invalidated.includes(match.key)) {
      values.set(match.key, item.value);
    }
  }
  const status = values.get("status");
  // An invalidated status reads as inbox with no anomaly: an anomaly is
  // about a value stored on a valid status property, not about the property.
  const statusInvalidated = tag.invalidated.includes("status");
  return {
    kind: "task",
    task: taskFromNotes({
      id: block.id,
      text: (block.content ?? [])
        .map((fragment) => (typeof fragment.v === "string" ? fragment.v : ""))
        .join(""),
      status: {
        key: statusInvalidated
          ? "inbox"
          : typeof status === "string"
            ? findStatusKey(status)?.key
            : undefined,
        value: status ?? null,
      },
      importance: numberValue(values.get("importance")),
      effort: numberValue(values.get("effort")),
      start: dateValue(values.get("start")),
      due: dateValue(values.get("due")),
      contexts: choicesValue(values.get("context")),
      labels: choicesValue(values.get("label")),
      note: textValue(values.get("note")),
      created: createdValue(block.id, block.created),
    }),
  };
}

// Value shapes per kind (tag-operations): numbers are numbers, single choice
// and text are strings, multiple choice is an array of strings, dates are ISO
// strings. Anything else reads as empty.

function numberValue(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function choicesValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * When the block was created: a Date, an ISO string or milliseconds since
 * the epoch. Anything else, or an invalid date, reads as the epoch with a
 * warning, so ordering by it never fails.
 */
function createdValue(blockId: number, value: unknown): Date {
  const at =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : undefined;
  if (at && !Number.isNaN(at.getTime())) return at;
  console.warn(
    `[nextaction] block ${blockId}: its creation time cannot be read; it reads as 1970-01-01`,
    value,
  );
  return new Date(0);
}

/** The local calendar day of a stored instant (ADR 0012, date-subtype). */
function dateValue(value: unknown): CalendarDate | null {
  if (typeof value !== "string") return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return {
    year: at.getFullYear(),
    month: at.getMonth() + 1,
    day: at.getDate(),
  };
}
