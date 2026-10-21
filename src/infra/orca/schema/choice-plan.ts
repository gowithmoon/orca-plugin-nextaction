// The plan for adding choices (#35 "补选项的计划"): before contexts
// are written, the values missing from the task tag's choices are added, or
// Orca stores them without showing them (multi-choices-created). Pure;
// executing it lives in the task repository.
import type { BlockProperty } from "../../../orca.d.ts";
import { findPropertyKey, propertyKeys } from "../codec/names";
import { choiceName } from "./startup-plan";
import type { PropertyDefinition } from "./tag-schema";

export type ChoicePlan =
  | { kind: "unchanged" }
  | {
      kind: "add";
      /** The values added as choices, in the order of the value list. */
      added: string[];
      /** The whole definition to write with `setProperties`. */
      definition: PropertyDefinition;
    };

/**
 * `pos` is always written explicitly (tag-operations): where the user moved
 * the property is kept, one without a position gets the plugin's, as the
 * startup plan does.
 */
function positionOf(property: BlockProperty): number {
  if (typeof property.pos === "number") return property.pos;
  const key = findPropertyKey(property.name)?.key;
  return key ? propertyKeys.indexOf(key) : 0;
}

/**
 * The choices to add to `property`, a multiple choice property on the task
 * tag, so that every one of `values` is a choice. New choices are objects
 * `{ n, c: "" }` (tag-operations), appended after the existing ones in the
 * order of `values`; everything already there is kept as it is.
 */
/**
 * The choices `typeArgs` holds, and those of `values` not among them, in the
 * order of `values`, each once. Choices are matched by name, string and
 * `{ n, c }` alike.
 */
export function missingChoices(
  typeArgs: Record<string, unknown>,
  values: readonly string[],
): { present: unknown[]; added: string[] } {
  const present: unknown[] = Array.isArray(typeArgs.choices)
    ? typeArgs.choices
    : [];
  const names = new Set(present.map(choiceName));
  // A value listed twice is added once.
  const added = [...new Set(values)].filter((value) => !names.has(value));
  return { present, added };
}

export function planChoiceAdditions(
  property: BlockProperty,
  values: readonly string[],
): ChoicePlan {
  const typeArgs: Record<string, unknown> = property.typeArgs ?? {};
  const { present, added } = missingChoices(typeArgs, values);
  if (added.length === 0) return { kind: "unchanged" };
  return {
    kind: "add",
    added,
    definition: {
      name: property.name,
      type: property.type,
      pos: positionOf(property),
      // Orca replaces typeArgs as a whole (tag-operations): everything there
      // is carried over, the new choices go after the existing ones.
      typeArgs: {
        ...typeArgs,
        choices: [...present, ...added.map((n) => ({ n, c: "" }))],
      },
    },
  };
}
