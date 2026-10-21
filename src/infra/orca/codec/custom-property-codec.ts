// Custom properties (GLOSSARY: 自定义属性, ADR 0023) on Orca: which properties
// of the task tag are ones, and how their values read and write
// (custom-properties spike).
import {
  type CustomPropertyDefinition,
  type CustomPropertyValue,
  type CustomPropertyValues,
  checkCustomPropertyValue,
  emptyCustomPropertyValue,
} from "../../../domain/task/custom-property";
import { PropType } from "../prop-type";
import { missingChoices } from "../schema/choice-plan";
import { choiceName } from "../schema/startup-plan";
import {
  type DependencyWriteItem,
  planBlockRefWrite,
} from "./dependency-write";
import { findPropertyKey } from "./names";
// task-codec imports this module too; only functions cross, called after
// both have loaded.
import {
  findTaskTagRef,
  isOrphan,
  mirrorSourceId,
  type RawBlock,
  refDataTargets,
  resolveDependencyTargets,
  taskText,
} from "./task-codec";
import type { RefDataItem } from "./task-encode";

/** A property definition on the task tag block, as get-blocks returns it. */
export interface TagPropertyDefinition {
  name: string;
  type?: number;
  pos?: number | null;
  typeArgs?: unknown;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

/** The option names of a choice property, string and `{ n, c }` alike. */
function choiceNames(typeArgs: Record<string, unknown>): string[] {
  const choices: unknown[] = Array.isArray(typeArgs.choices)
    ? typeArgs.choices
    : [];
  const names: string[] = [];
  for (const choice of choices) {
    const name = choiceName(choice);
    if (typeof name === "string" && name !== "" && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/** The definition a property stands for, or `undefined` when it is not one. */
function definitionOf(
  property: TagPropertyDefinition,
): CustomPropertyDefinition | undefined {
  const { name } = property;
  // System properties (`_repr`, `_show`), and the plugin's own in either
  // language, whatever the tag's language; an invalidated one too (ADR 0008).
  if (name.startsWith("_") || findPropertyKey(name)) return undefined;
  const typeArgs = record(property.typeArgs);
  switch (property.type) {
    case PropType.Text:
      return { name, kind: "text" };
    case PropType.Number:
      return { name, kind: "number" };
    case PropType.Boolean:
      return { name, kind: "boolean" };
    case PropType.BlockRefs:
      return {
        name,
        kind: "blockRefs",
        scope:
          typeof typeArgs.scope === "string" && typeArgs.scope !== ""
            ? typeArgs.scope
            : null,
      };
    case PropType.DateTime:
      // Without a subtype, or with one not known, as a date and time.
      return {
        name,
        kind:
          typeArgs.subType === "date" || typeArgs.subType === "time"
            ? typeArgs.subType
            : "datetime",
      };
    case PropType.TextChoices:
      // Without a subtype, a single choice.
      return {
        name,
        kind: typeArgs.subType === "multi" ? "multi" : "single",
        choices: choiceNames(typeArgs),
      };
    default:
      // JSON and computed properties, and any type not known.
      return undefined;
  }
}

/** A whole property definition to write with `setProperties`. */
export interface CustomPropertyDefinitionWrite {
  name: string;
  type: number;
  pos: number | null;
  typeArgs: Record<string, unknown>;
}

/**
 * The definition to write so every option of a single or multiple choice
 * value is one of the property's choices (multi-choices-created), or
 * `undefined` when all already are. The only custom property definition the
 * plugin writes (ADR 0023). New options follow the format of the existing
 * ones: strings after strings, `{ n, c }` after objects, objects when there
 * are none. The whole `typeArgs` is carried over and `pos` kept, `null`
 * included (tag-operations, custom-properties). Fails with
 * `CustomPropertyChangedError` when the property is no longer defined or its
 * kind is not the value's.
 */
export function planCustomChoiceAdditions(
  properties: readonly TagPropertyDefinition[],
  name: string,
  value: Extract<CustomPropertyValue, { kind: "single" | "multi" }>,
): CustomPropertyDefinitionWrite | undefined {
  checkCustomPropertyValue(customPropertyDefinitions(properties), name, value);
  // Found: the check above passed.
  const property = properties.find((p) => p.name === name) as
    | TagPropertyDefinition
    | undefined;
  if (!property) return undefined;
  const values =
    value.kind === "multi" ? value.value : value.value ? [value.value] : [];
  const typeArgs = record(property.typeArgs);
  const { present, added } = missingChoices(typeArgs, values);
  if (added.length === 0) return undefined;
  const asStrings = present.length > 0 && typeof present[0] === "string";
  return {
    name,
    type: PropType.TextChoices,
    pos: typeof property.pos === "number" ? property.pos : null,
    typeArgs: {
      ...typeArgs,
      choices: [
        ...present,
        ...added.map((n) => (asStrings ? n : { n, c: "" })),
      ],
    },
  };
}

/**
 * What to write so the block reference custom property `name` of the task
 * holds exactly `targets` (block IDs of source blocks), as dependencies are
 * written (tag-operations A2, A4, A5): a target already held keeps its
 * reference, a new one gets a reference created first. Throws
 * `CustomPropertyChangedError` when `name` is not a block reference property
 * now.
 */
export function planBlockRefsWrite(
  definitions: readonly CustomPropertyDefinition[],
  block: Pick<RawBlock, "refs">,
  tagBlockId: number,
  name: string,
  targets: readonly number[],
): DependencyWriteItem[] {
  checkCustomPropertyValue(definitions, name, {
    kind: "blockRefs",
    value: targets,
  });
  const data = findTaskTagRef(block.refs, tagBlockId)?.data ?? [];
  const held = data.find((d) => d.name === name)?.value;
  return planBlockRefWrite(
    block,
    new Set(Array.isArray(held) ? held : []),
    targets,
  );
}

/**
 * The item to write with `setRefData` for a block reference custom
 * property: reference IDs, never block IDs (tag-operations A2); `[]` removes
 * the value with its references (A4).
 */
export function encodeBlockRefs(
  name: string,
  refIds: readonly number[],
): RefDataItem {
  return { name, type: PropType.BlockRefs, value: [...refIds] };
}

/**
 * The item to write with `setRefData` for a custom property's new value.
 * `now` is when it is written. Block reference values are planned with
 * `planBlockRefsWrite`, as they need references created first.
 */
export function planCustomPropertyWrite(
  definitions: readonly CustomPropertyDefinition[],
  name: string,
  value: Exclude<CustomPropertyValue, { kind: "blockRefs" }>,
  now: Date,
): RefDataItem {
  checkCustomPropertyValue(definitions, name, value);
  switch (value.kind) {
    case "time": {
      const time = value.value;
      return {
        name,
        type: PropType.DateTime,
        // Today's local date with the chosen hours and minutes, the shape
        // Orca's interface writes (custom-properties).
        value:
          time &&
          new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            time.hours,
            time.minutes,
          ),
      };
    }
    case "date": {
      const date = value.value;
      return {
        name,
        type: PropType.DateTime,
        // Local midnight of that day (ADR 0012, date-subtype).
        value: date && new Date(date.year, date.month - 1, date.day),
      };
    }
    case "datetime":
      // The type is passed with dates as the spikes did.
      return { name, type: PropType.DateTime, value: value.value };
    case "boolean":
      // Always with `type: 4` (next-action-hierarchy-boolean-deps).
      return { name, type: PropType.Boolean, value: value.value };
    case "text":
    case "number":
      return { name, value: value.value };
    case "single":
      return { name, value: value.value };
    case "multi":
      // An empty list clears with null, as contexts do.
      return { name, value: value.value.length > 0 ? [...value.value] : null };
  }
}

/** One item of the task tag reference's `data`. */
export interface RefDataValue {
  name: string;
  value?: unknown;
}

/** Decodes one stored value of a definition of the kinds read so far. */
function decodeValue(
  kind: CustomPropertyDefinition["kind"],
  value: unknown,
): CustomPropertyValue | undefined {
  if (value === null || value === undefined) {
    return kind === "blockRefs" ? undefined : emptyCustomPropertyValue(kind);
  }
  switch (kind) {
    case "text":
      return { kind, value: textValue(value) };
    case "number":
      return { kind, value: typeof value === "number" ? value : null };
    case "boolean":
      // Only `true` is on, as for sequential.
      return { kind, value: value === true };
    case "date": {
      // The local calendar day, as start and due (ADR 0012).
      const at = momentValue(value);
      return {
        kind,
        value: at && {
          year: at.getFullYear(),
          month: at.getMonth() + 1,
          day: at.getDate(),
        },
      };
    }
    case "datetime":
      return { kind, value: momentValue(value) };
    case "time": {
      // Only the local hours and minutes; the date part is the day it was
      // filled in (custom-properties).
      const at = momentValue(value);
      return {
        kind,
        value: at && { hours: at.getHours(), minutes: at.getMinutes() },
      };
    }
    case "single":
      // An option name.
      return { kind, value: typeof value === "string" ? value : null };
    case "multi":
      // Option names; an item that is not a string is dropped.
      return {
        kind,
        value: Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : [],
      };
    default:
      return undefined;
  }
}

/**
 * A text value: a string as it is, a number as its digits (a number typed
 * into a text property is stored as a number, custom-properties), anything
 * else empty.
 */
export function textValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** A stored instant: a Date, as get-blocks returns it, or an ISO string. */
function momentValue(value: unknown): Date | null {
  const at =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : undefined;
  return at && !Number.isNaN(at.getTime()) ? at : null;
}

/** A reference of the task block, as get-blocks returns it. */
export interface BlockRef {
  id: number;
  type: number;
  to: number;
}

/** A block offered as a block reference target. */
export interface FoundBlock {
  id: number;
  text: string;
}

type CandidateBlock = Pick<
  RawBlock,
  "id" | "parent" | "aliases" | "content" | "properties"
>;

/**
 * Block reference candidates from the blocks a search found, in order: a
 * mirror as its source block (from `sources`, read for it; left out when not
 * there), each block once. Journal blocks and orphans (no parent, no alias,
 * ADR 0013) are left out; a page reads as its alias.
 */
export function blockCandidates(
  found: readonly CandidateBlock[],
  sources: ReadonlyMap<number, CandidateBlock>,
): FoundBlock[] {
  const candidates: FoundBlock[] = [];
  const seen = new Set<number>();
  for (const block of found) {
    const sourceId = mirrorSourceId(block);
    const source = sourceId === undefined ? block : sources.get(sourceId);
    if (!source || mirrorSourceId(source) !== undefined) continue;
    if (isOrphan(source) || seen.has(source.id)) continue;
    seen.add(source.id);
    candidates.push({ id: source.id, text: taskText(source) });
  }
  return candidates;
}

/**
 * The values with every block reference target that is a mirror replaced by
 * its source block (block-properties-json M1), each once, in order. `blocks`
 * holds the target blocks as read; a target not among them stays as it is.
 * One hop only, as for dependencies.
 */
export function resolveBlockRefTargets(
  values: CustomPropertyValues,
  blocks: ReadonlyMap<number, Pick<RawBlock, "properties">>,
): CustomPropertyValues {
  const resolved: Record<string, CustomPropertyValue> = {};
  for (const [name, value] of Object.entries(values)) {
    resolved[name] =
      value.kind === "blockRefs"
        ? {
            kind: "blockRefs",
            value: resolveDependencyTargets(value.value, blocks),
          }
        : value;
  }
  return resolved;
}

/**
 * A task's custom property values, from the `data` of its reference to the
 * task tag, by definition name. `refs` are the task block's references, which
 * block reference values point through.
 */
export function decodeCustomPropertyValues(
  data: readonly RefDataValue[] | null | undefined,
  definitions: readonly CustomPropertyDefinition[],
  refs: readonly BlockRef[] = [],
): CustomPropertyValues {
  const values: Record<string, CustomPropertyValue> = {};
  for (const definition of definitions) {
    const item = (data ?? []).find((i) => i.name === definition.name);
    if (definition.kind === "blockRefs") {
      values[definition.name] = {
        kind: "blockRefs",
        // Resolved as dependencies are; each target once.
        value: [...new Set(refDataTargets(refs, item?.value))],
      };
      continue;
    }
    const decoded = decodeValue(definition.kind, item?.value);
    if (decoded) values[definition.name] = decoded;
  }
  return values;
}

/**
 * The custom properties among the task tag's property definitions, in
 * Orca's order: by `pos`, then those without one by name, in Unicode order
 * (tag-operations, custom-properties).
 */
export function customPropertyDefinitions(
  properties: readonly TagPropertyDefinition[],
): CustomPropertyDefinition[] {
  const found: { pos: number | null; definition: CustomPropertyDefinition }[] =
    [];
  for (const property of properties) {
    const definition = definitionOf(property);
    if (definition) {
      found.push({
        pos: typeof property.pos === "number" ? property.pos : null,
        definition,
      });
    }
  }
  found.sort((a, b) => {
    if (a.pos !== null && b.pos !== null && a.pos !== b.pos) {
      return a.pos - b.pos;
    }
    if (a.pos !== null && b.pos === null) return -1;
    if (a.pos === null && b.pos !== null) return 1;
    const x = a.definition.name;
    const y = b.definition.name;
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return found.map((item) => item.definition);
}
