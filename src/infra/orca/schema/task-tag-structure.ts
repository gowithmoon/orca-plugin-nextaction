// The structure the plugin expects on the task tag (spec #16, ADR 0008).
import type { BlockProperty } from "../../../orca.d.ts";
import {
  type NoteLanguage,
  type PropertyKey,
  propertyName,
  statusKeys,
  statusName,
} from "../codec/names";

/** Orca `PropType` codes (plugin-docs/constants/db.md). */
export const PropType = {
  Text: 1,
  Number: 3,
  DateTime: 5,
  TextChoices: 6,
} as const;

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

type TypeArgsFor = (language: NoteLanguage) => Record<string, unknown>;

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
];

/** Every property definition of a newly created task tag, in `pos` order. */
export function taskTagDefinitions(
  language: NoteLanguage,
): PropertyDefinition[] {
  return structure.map(({ key, type, typeArgs }, pos) => ({
    name: propertyName(key, language),
    type,
    pos,
    ...(typeArgs ? { typeArgs: typeArgs(language) } : {}),
  }));
}
