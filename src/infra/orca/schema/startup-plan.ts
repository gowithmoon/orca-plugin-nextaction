// The startup plan: given what was found in the notes, decide what to do with
// the task tag and which property definitions to write. Pure; executing the
// plan against Orca lives in ./run-startup-plan.ts.
//
// #18 covers creating the tag and leaving a complete tag alone. Alignment and
// conflicts (#19), and the cache and rename recovery (#23) extend the input,
// the action union and the writes.
import type { Block } from "../../../orca.d.ts";
import type { NoteLanguage } from "../codec/names";
import {
  type PropertyDefinition,
  taskTagDefinitions,
} from "./task-tag-structure";

export interface StartupInput {
  /** The task tag name from the settings, already resolved (never empty). */
  tagName: string;
  /** The block whose alias is `tagName`, if any. */
  tagBlock: Pick<Block, "id" | "properties"> | undefined;
  /** Language of the current interface; used only for names of new things. */
  uiLanguage: NoteLanguage;
}

export type StartupAction =
  | { kind: "create"; tagName: string }
  | { kind: "use"; tagBlockId: number };

export interface StartupPlan {
  action: StartupAction;
  /** Property definitions to write to the tag block, each complete with `pos`. */
  writes: PropertyDefinition[];
}

export function planStartup(input: StartupInput): StartupPlan {
  if (input.tagBlock) {
    // Alignment of an incomplete tag is added in #19.
    return {
      action: { kind: "use", tagBlockId: input.tagBlock.id },
      writes: [],
    };
  }
  return {
    action: { kind: "create", tagName: input.tagName },
    writes: taskTagDefinitions(input.uiLanguage),
  };
}
