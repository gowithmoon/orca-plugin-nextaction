// The structure the plugin expects on the task tag (spec #16, ADR 0008).
import {
  defaultTagNames,
  dependencyModeKeys,
  dependencyModeName,
  findPropertyKey,
  type NoteLanguage,
  type PropertyKey,
  propertyKeys,
  propertyName,
  statusKeys,
  statusName,
} from "../codec/names";
import { PropType } from "../prop-type";
import type { PropertyDefinition, TagSchema } from "./tag-schema";

/** Fixed colors of the status options, shown in Orca's own interface. */
const statusColors = {
  inbox: "#9e9e9e",
  todo: "#2196f3",
  doing: "#ff9800",
  waiting: "#9c27b0",
  someday: "#795548",
  done: "#4caf50",
} as const;

/**
 * The type arguments, given the tag's language, its name in use and the
 * project tag's name in use (`undefined` while the project tag is not
 * ready); `undefined` for none.
 */
type TypeArgsFor = (
  language: NoteLanguage,
  tagName: string,
  projectTagName: string | undefined,
) => Record<string, unknown> | undefined;

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
  // `c: ""` as the plugin adds context choices
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
  // Like importance and effort (#79); appended, as the schema only grows
  // (ADR 0008).
  {
    key: "urgency",
    type: PropType.Number,
    typeArgs: () => ({ defaultEnabled: true, default: 4 }),
  },
  // Whole days, no default (#77): empty reads as 0. Written bare, as numbers
  // were in the tag-operations spike.
  { key: "dependencyDelay", type: PropType.Number },
  // A block reference to the project, single valued by the plugin's own
  // rule (#145, project-tag). Its scope holds the project tag's name, so
  // Orca offers only projects, and Orca follows `renameAlias` (project-tag,
  // round 2). With no project tag ready there is no name to scope to: the
  // scope is left out, and alignment adds it on a later start.
  {
    key: "project",
    type: PropType.BlockRefs,
    typeArgs: (_language, _tagName, projectTagName) =>
      projectTagName === undefined ? undefined : { scope: projectTagName },
  },
];

/**
 * Every property definition of a task tag called `tagName`, in `pos` order.
 */
export function taskTagDefinitions(
  language: NoteLanguage,
  tagName: string,
  projectTagName?: string,
): PropertyDefinition[] {
  return structure.map(({ key, type, typeArgs }, pos) => {
    const args = typeArgs?.(language, tagName, projectTagName);
    return {
      name: propertyName(key, language),
      type,
      pos,
      ...(args ? { typeArgs: args } : {}),
    };
  });
}

/**
 * The task tag as the shared tag mechanism sees it, given where to read the
 * project tag's name in use (`undefined` while it is not ready).
 */
export function taskTagSchemaFor(
  projectTagName: () => string | undefined,
): TagSchema<PropertyKey> {
  return {
    keys: propertyKeys,
    defaultNames: defaultTagNames,
    propertyName,
    findPropertyKey,
    definitions: (language, tagName) =>
      taskTagDefinitions(language, tagName, projectTagName()),
  };
}

/** The task tag with no project tag ready: 所属项目 has no scope. */
export const taskTagSchema: TagSchema<PropertyKey> = taskTagSchemaFor(
  () => undefined,
);
