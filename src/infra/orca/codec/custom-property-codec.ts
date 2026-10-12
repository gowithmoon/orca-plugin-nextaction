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
import { choiceName } from "../schema/startup-plan";
import { findPropertyKey } from "./names";
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

/**
 * The item to write with `setRefData` for a custom property's new value.
 * `now` is when it is written.
 */
export function planCustomPropertyWrite(
  definitions: readonly CustomPropertyDefinition[],
  name: string,
  value: CustomPropertyValue,
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
    default:
      // Choice and block reference properties are written by #114, #115.
      throw new Error(
        `writing a custom property of kind ${value.kind} is not supported yet`,
      );
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
    return kind === "single" || kind === "multi" || kind === "blockRefs"
      ? undefined
      : emptyCustomPropertyValue(kind);
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

/**
 * A task's custom property values, from the `data` of its reference to the
 * task tag, by definition name.
 */
export function decodeCustomPropertyValues(
  data: readonly RefDataValue[] | null | undefined,
  definitions: readonly CustomPropertyDefinition[],
): CustomPropertyValues {
  const values: Record<string, CustomPropertyValue> = {};
  for (const definition of definitions) {
    const item = (data ?? []).find((i) => i.name === definition.name);
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
