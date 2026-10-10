// Block → Task decoding. Values come from the task block's reference to the
// task tag block (tag-operations): `refs[]` with `type === 2` and `to` equal
// to the tag block ID, its `data` holding one item per property.

import {
  type CalendarDate,
  type DependencyMode,
  type Task,
  taskFromNotes,
} from "../../../domain/task/task";
import {
  findDependencyModeKey,
  findPropertyKey,
  findStatusKey,
  type PropertyKey,
} from "./names";

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
    /** The reference's own ID: what a block reference property's value holds. */
    id: number;
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
      text: taskText(block),
      status: {
        key: statusInvalidated
          ? "inbox"
          : typeof status === "string"
            ? findStatusKey(status)?.key
            : undefined,
        value: status ?? null,
      },
      importance: numberValue(values.get("importance")),
      urgency: numberValue(values.get("urgency")),
      effort: numberValue(values.get("effort")),
      start: dateValue(values.get("start")),
      due: dateValue(values.get("due")),
      contexts: choicesValue(values.get("context")),
      labels: choicesValue(values.get("label")),
      note: textValue(values.get("note")),
      sequential: booleanValue(values.get("sequential")),
      dependencies: dependencyTargets(block, values.get("dependencies")),
      dependencyMode: dependencyModeValue(values.get("dependencyMode")),
      dependencyDelay: numberValue(values.get("dependencyDelay")),
      created: createdValue(block.id, block.created),
    }),
  };
}

/**
 * The block's own text. A page's title is its alias, its content empty
 * (plugin-panel-writes), so a page without content reads as its first alias.
 */
function taskText(block: RawBlock): string {
  const text = (block.content ?? [])
    .map((fragment) => (typeof fragment.v === "string" ? fragment.v : ""))
    .join("");
  return text.trim() === "" && block.aliases[0] !== undefined
    ? block.aliases[0]
    : text;
}

// Value shapes per kind (tag-operations): numbers are numbers, single choice
// and text are strings, multiple choice is an array of strings, dates are
// Dates (plugin-panel-writes; ISO strings are accepted too). Anything else reads
// as empty.

function numberValue(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Only `true` is on: `false`, `null`, a missing item and anything else are
 * off (next-action-hierarchy-boolean-deps).
 */
function booleanValue(value: unknown): boolean {
  return value === true;
}

/**
 * A single choice: "any" only for the name of the any option in either
 * language; empty, unknown and anything else read as "all" (#58), so data
 * spoilt by hand never lets a task out early.
 */
function dependencyModeValue(value: unknown): DependencyMode {
  return typeof value === "string" &&
    findDependencyModeKey(value)?.key === "any"
    ? "any"
    : "all";
}

/** Orca `RefType.RefData`: what a block reference property's value points through. */
const refDataRef = 3;

/**
 * The target block IDs of a dependencies value. The value holds reference
 * IDs, never block IDs (tag-operations A2): each is resolved through the
 * block's own `type: 3` reference of that ID to the block it points at.
 */
function dependencyTargets(
  block: Pick<RawBlock, "refs">,
  value: unknown,
): number[] {
  if (!Array.isArray(value)) return [];
  const targets: number[] = [];
  for (const refId of value) {
    const ref = block.refs.find((r) => r.id === refId && r.type === refDataRef);
    if (ref) targets.push(ref.to);
  }
  return targets;
}

/**
 * Dependency targets with every mirror replaced by its source block
 * (block-properties-json M1), each once, in order. `blocks` holds the target
 * blocks as read; a target not among them, or no mirror, stays as it is.
 * One hop only, as for every other block ID (a mirror of a mirror is not
 * measured).
 */
export function resolveDependencyTargets(
  targets: readonly number[],
  blocks: ReadonlyMap<number, Pick<RawBlock, "properties">>,
): number[] {
  const resolved = new Set<number>();
  for (const target of targets) {
    const block = blocks.get(target);
    resolved.add((block && mirrorSourceId(block)) ?? target);
  }
  return [...resolved];
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
  const at =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : undefined;
  if (!at) return null;
  if (Number.isNaN(at.getTime())) return null;
  return {
    year: at.getFullYear(),
    month: at.getMonth() + 1,
    day: at.getDate(),
  };
}
