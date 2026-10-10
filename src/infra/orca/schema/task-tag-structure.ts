// The structure the plugin expects on the task tag (spec #16, ADR 0008).
import type { BlockProperty } from "../../../orca.d.ts";
import {
  dependencyModeKeys,
  dependencyModeName,
  type NoteLanguage,
  type PropertyKey,
  propertyName,
  statusKeys,
  statusName,
} from "../codec/names";
import { PropType } from "../prop-type";

/** A property definition as written to the tag block with `setProperties`. */
export type PropertyDefinition = Required<
  Pick<BlockProperty, "name" | "type" | "pos">
> &
  Pick<BlockProperty, "typeArgs">;

/** Fixed colors of the status options, shown in Orca's own interface. */
const statusColors = {
  inbox: "#9e9e9e",
  todo: "#2196f3",
  doing: "#ff9800",
  waiting: "#9c27b0",
  someday: "#795548",
  done: "#4caf50",
} as const;

/** The type arguments, given the tag's language and its name in use. */
type TypeArgsFor = (
  language: NoteLanguage,
  tagName: string,
) => Record<string, unknown>;

/** In display order; the index is the property's `pos`. */
const structure: readonly {
  key: PropertyKey;
  type: number;
  typeArgs?: TypeArgsFor;
}[] = [
  {
    key: "status",
    type: PropType.TextChoices,
    typeArgs: (language) => ({
      subType: "single",
      defaultEnabled: true,
      default: statusName("inbox", language),
      choices: statusKeys.map((key) => ({
        n: statusName(key, language),
        c: statusColors[key],
      })),
    }),
  },
  {
    key: "importance",
    type: PropType.Number,
    typeArgs: () => ({ defaultEnabled: true, default: 4 }),
  },
  {
    key: "effort",
    type: PropType.Number,
    typeArgs: () => ({ defaultEnabled: true, default: 4 }),
  },
  // Dates only, no time of day (ADR 0012).
  {
    key: "start",
    type: PropType.DateTime,
    typeArgs: () => ({ subType: "date" }),
  },
  {
    key: "due",
    type: PropType.DateTime,
    typeArgs: () => ({ subType: "date" }),
  },
  // No preset choices: the user decides them.
  {
    key: "context",
    type: PropType.TextChoices,
    typeArgs: () => ({ subType: "multi", choices: [] }),
  },
  {
    key: "label",
    type: PropType.TextChoices,
    typeArgs: () => ({ subType: "multi", choices: [] }),
  },
  // Text takes no type arguments (tag-operations spike writes it bare).
  { key: "note", type: PropType.Text },
  // Unchecked by default; without the default a tagged block holds no value
  // (next-action-hierarchy-boolean-deps).
  {
    key: "sequential",
    type: PropType.Boolean,
    typeArgs: () => ({ defaultEnabled: true, default: false }),
  },
  // Block references (#57): the values are reference IDs (tag-operations
  // A2). Orca's own search for a value is scoped to the task tag; the scope
  // holds the tag's name and Orca follows `renameAlias` (blockrefs-scope).
  {
    key: "dependencies",
    type: PropType.BlockRefs,
    typeArgs: (_, tagName) => ({ scope: tagName }),
  },
  // Single choice, "all" by default (#58). No fixed colors: choices carry
  // `c: ""` as the plugin adds context and label choices
  // (multi-choices-created).
  {
    key: "dependencyMode",
    type: PropType.TextChoices,
    typeArgs: (language) => ({
      subType: "single",
      defaultEnabled: true,
      default: dependencyModeName("all", language),
      choices: dependencyModeKeys.map((key) => ({
        n: dependencyModeName(key, language),
        c: "",
      })),
    }),
  },
];

/**
 * Every property definition of a task tag called `tagName`, in `pos` order.
 */
export function taskTagDefinitions(
  language: NoteLanguage,
  tagName: string,
): PropertyDefinition[] {
  return structure.map(({ key, type, typeArgs }, pos) => ({
    name: propertyName(key, language),
    type,
    pos,
    ...(typeArgs ? { typeArgs: typeArgs(language, tagName) } : {}),
  }));
}
