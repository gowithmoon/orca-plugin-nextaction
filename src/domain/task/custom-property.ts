// Custom properties (GLOSSARY: 自定义属性, ADR 0023): properties the user adds
// to the task tag in Orca, beyond the plugin's own. Only a record: nothing
// here takes part in next actions, blocking, scores, recurrence, reminders or
// reviews. Pure; no Orca types.
import type { TimeOfDay } from "../time/time-of-day";
import type { CalendarDate, TaskId } from "./task";

/** The nine kinds of custom property, by English key. */
export const customPropertyKinds = [
  "text",
  "number",
  "boolean",
  "date",
  "datetime",
  "time",
  "single",
  "multi",
  "blockRefs",
] as const;
export type CustomPropertyKind = (typeof customPropertyKinds)[number];

/**
 * A custom property's definition. `name` is the property name in the notes,
 * shown to the user as it is (not translated, ADR 0009 is about the
 * plugin's own names).
 */
export type CustomPropertyDefinition =
  | {
      readonly name: string;
      readonly kind:
        | "text"
        | "number"
        | "boolean"
        | "date"
        | "datetime"
        | "time";
    }
  | {
      readonly name: string;
      readonly kind: "single" | "multi";
      /** The option names, in the order Orca holds them. */
      readonly choices: readonly string[];
    }
  | {
      readonly name: string;
      readonly kind: "blockRefs";
      /** The tag name candidates are searched under; `null` for every block. */
      readonly scope: string | null;
    };

/**
 * A custom property's value, by kind. `null` (and an empty list) is empty;
 * a boolean is off unless on.
 */
export type CustomPropertyValue =
  | { readonly kind: "text"; readonly value: string | null }
  | { readonly kind: "number"; readonly value: number | null }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "date"; readonly value: CalendarDate | null }
  /** An instant. */
  | { readonly kind: "datetime"; readonly value: Date | null }
  /** A local time of day only. */
  | { readonly kind: "time"; readonly value: TimeOfDay | null }
  /** An option name. */
  | { readonly kind: "single"; readonly value: string | null }
  /** Option names. */
  | { readonly kind: "multi"; readonly value: readonly string[] }
  /** The target blocks, by the IDs of their (source) blocks. */
  | { readonly kind: "blockRefs"; readonly value: readonly TaskId[] };

/** A task's custom property values, by property name. */
export type CustomPropertyValues = Readonly<
  Record<string, CustomPropertyValue>
>;

/**
 * A write to a custom property that is no longer defined, or whose kind is
 * not the value's (the user may just have deleted or changed it in Orca).
 * Nothing was written.
 */
export class CustomPropertyChangedError extends Error {
  override name = "CustomPropertyChangedError";
  constructor(
    readonly property: string,
    readonly reason: "not-defined" | "kind-changed",
  ) {
    super(
      reason === "not-defined"
        ? `the custom property "${property}" is no longer defined`
        : `the custom property "${property}" changed its type`,
    );
  }
}

/**
 * Checks `value` against the current definitions: throws
 * `CustomPropertyChangedError` when `name` is not defined, or is defined
 * with another kind.
 */
export function checkCustomPropertyValue(
  definitions: readonly CustomPropertyDefinition[],
  name: string,
  value: CustomPropertyValue,
): CustomPropertyDefinition {
  const definition = definitions.find((d) => d.name === name);
  if (!definition) throw new CustomPropertyChangedError(name, "not-defined");
  if (definition.kind !== value.kind) {
    throw new CustomPropertyChangedError(name, "kind-changed");
  }
  return definition;
}

/** What an empty value of `kind` is. */
export function emptyCustomPropertyValue(
  kind: CustomPropertyKind,
): CustomPropertyValue {
  switch (kind) {
    case "boolean":
      return { kind, value: false };
    case "multi":
    case "blockRefs":
      return { kind, value: [] };
    default:
      return { kind, value: null };
  }
}
