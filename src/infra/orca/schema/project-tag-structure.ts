// The structure the plugin expects on the project tag (#140, #143; ADR 0008,
// 0025). Created, aligned, taken over and renamed by the shared tag
// mechanism (#141), independently of the task tag.
import { projectStatuses } from "../../../domain/project/project";
import type { NoteLanguage } from "../codec/names";
import {
  defaultProjectTagNames,
  findProjectPropertyKey,
  type ProjectPropertyKey,
  projectPropertyKeys,
  projectPropertyName,
  projectStatusName,
} from "../codec/project-names";
import { PropType } from "../prop-type";
import type { PropertyDefinition, TagSchema } from "./tag-schema";

/**
 * Fixed colors of the project status options, those of the task status of
 * the like kind (#140): planning as todo, active as doing, paused as
 * waiting, someday and done as themselves.
 */
const projectStatusColors = {
  planning: "#2196f3",
  active: "#ff9800",
  paused: "#9c27b0",
  someday: "#795548",
  done: "#4caf50",
} as const;

const rating = () => ({ defaultEnabled: true, default: 4 });

/** In display order; the index is the property's `pos`. */
const structure: readonly {
  key: ProjectPropertyKey;
  type: number;
  typeArgs?: (language: NoteLanguage) => Record<string, unknown>;
}[] = [
  {
    key: "status",
    type: PropType.TextChoices,
    typeArgs: (language) => ({
      subType: "single",
      defaultEnabled: true,
      default: projectStatusName("planning", language),
      choices: projectStatuses.map((key) => ({
        n: projectStatusName(key, language),
        c: projectStatusColors[key],
      })),
    }),
  },
  // Text takes no type arguments, as the task tag's notes.
  { key: "goal", type: PropType.Text },
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
  { key: "importance", type: PropType.Number, typeArgs: rating },
  { key: "urgency", type: PropType.Number, typeArgs: rating },
];

function projectTagDefinitions(language: NoteLanguage): PropertyDefinition[] {
  return structure.map(({ key, type, typeArgs }, pos) => ({
    name: projectPropertyName(key, language),
    type,
    pos,
    ...(typeArgs ? { typeArgs: typeArgs(language) } : {}),
  }));
}

/** The project tag as the shared tag mechanism sees it. */
export const projectTagSchema: TagSchema<ProjectPropertyKey> = {
  keys: projectPropertyKeys,
  defaultNames: defaultProjectTagNames,
  propertyName: projectPropertyName,
  findPropertyKey: findProjectPropertyKey,
  definitions: projectTagDefinitions,
};
