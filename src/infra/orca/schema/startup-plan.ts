// The startup plan: given what was found in the notes, decide what to do with
// the task tag and which property definitions to write. Pure; executing the
// plan against Orca lives in ./run-startup-plan.ts.
import type { Block, BlockProperty } from "../../../orca.d.ts";
import {
  findPropertyKey,
  type NoteLanguage,
  type PropertyKey,
  propertyKeys,
} from "../codec/names";
import {
  type PropertyDefinition,
  taskTagDefinitions,
} from "./task-tag-structure";

/** What this repo remembers about the task tag it last used (ADR 0002). */
export interface TaskTagCache {
  tagBlockId: number;
  tagName: string;
}

export interface StartupInput {
  /** The task tag name from the settings, already resolved (never empty). */
  tagName: string;
  /** The block whose alias is `tagName`, if any. */
  tagBlock: Pick<Block, "id" | "properties"> | undefined;
  /** This repo's cache; `undefined` when there is none (or it is unreadable). */
  cache: TaskTagCache | undefined;
  /**
   * The block the cache points at, read only when no block is called
   * `tagName`; `undefined` when it was not read or no longer exists. Block IDs
   * are reused (tag-operations spike), so it is checked, not trusted.
   */
  cachedBlock?: Pick<Block, "id" | "aliases" | "properties"> | undefined;
  /** Language of the current interface; used only for names of new things. */
  uiLanguage: NoteLanguage;
}

export type StartupAction =
  | { kind: "create"; tagName: string }
  /**
   * A tag of that name exists but was never taken over here, and some of its
   * properties conflict: leave it alone; task features are paused (ADR 0008).
   */
  | { kind: "refuse"; conflicts: PropertyKey[]; language: NoteLanguage }
  | {
      kind: "use";
      tagBlockId: number;
      /** Plugin properties whose definition conflicts with the plugin's. */
      invalidated: PropertyKey[];
      /** Language of the names on the tag (ADR 0009). */
      language: NoteLanguage;
    }
  /**
   * The name was changed in the settings while the plugin was off: rename the
   * cached tag from `from` to `to` instead of creating one (ADR 0002), then
   * use it as with `use`.
   */
  | {
      kind: "rename";
      from: string;
      to: string;
      tagBlockId: number;
      invalidated: PropertyKey[];
      language: NoteLanguage;
    };

export interface StartupPlan {
  action: StartupAction;
  /** Property definitions to write to the tag block, each complete with `pos`. */
  writes: PropertyDefinition[];
}

type TypeArgs = Record<string, unknown>;

const choiceName = (choice: unknown): unknown =>
  typeof choice === "object" && choice !== null && "n" in choice
    ? choice.n
    : choice;

/**
 * The existing type arguments with whatever the plugin expects but is missing
 * filled in. Orca replaces `typeArgs` as a whole (tag-operations spike), so
 * everything already there is carried over unchanged.
 */
function mergeTypeArgs(existing: TypeArgs, expected: TypeArgs): TypeArgs {
  const merged: TypeArgs = { ...existing };
  for (const [key, value] of Object.entries(expected)) {
    if (key === "choices") {
      const present: unknown[] = Array.isArray(existing.choices)
        ? existing.choices
        : [];
      const names = new Set(present.map(choiceName));
      const missing = (value as unknown[]).filter(
        (choice) => !names.has(choiceName(choice)),
      );
      merged.choices = [...present, ...missing];
    } else if (key === "defaultEnabled" || merged[key] === undefined) {
      // A default that was switched off is switched back on; any other
      // setting the user already has is kept.
      merged[key] = value;
    }
  }
  return merged;
}

/** The definition to write for `existing`, or `undefined` if it is complete. */
function alignProperty(
  existing: BlockProperty,
  expected: PropertyDefinition,
): PropertyDefinition | undefined {
  if (expected.typeArgs === undefined) return undefined;
  const current: TypeArgs = existing.typeArgs ?? {};
  const merged = mergeTypeArgs(current, expected.typeArgs);
  if (JSON.stringify(merged) === JSON.stringify(current)) return undefined;
  // `pos` is always written explicitly; where the user moved the property is
  // kept, a property without a position gets the plugin's.
  const pos = typeof existing.pos === "number" ? existing.pos : expected.pos;
  return { ...expected, pos, typeArgs: merged };
}

/**
 * The language of the plugin properties already on the tag (ADR 0009): the
 * one most of their names belong to, so a user's own property that happens to
 * carry a plugin name of the other language does not decide it. The interface
 * language when the tag has none of them yet, or on a tie.
 */
function tagLanguage(
  properties: readonly BlockProperty[],
  uiLanguage: NoteLanguage,
): NoteLanguage {
  const counts: Record<NoteLanguage, number> = { zh: 0, en: 0 };
  for (const property of properties) {
    const match = findPropertyKey(property.name);
    if (match) counts[match.language] += 1;
  }
  if (counts.zh === counts.en) return uiLanguage;
  return counts.zh > counts.en ? "zh" : "en";
}

/**
 * Whether `existing` cannot be aligned to `expected`: alignment never changes
 * a type (ADR 0008). A missing subtype counts as different, since adding one
 * could change how Orca reads the values already stored.
 */
function conflicts(
  existing: BlockProperty,
  expected: PropertyDefinition,
): boolean {
  if (existing.type !== expected.type) return true;
  const subType: unknown = expected.typeArgs?.subType;
  return subType !== undefined && existing.typeArgs?.subType !== subType;
}

/** Plan for a tag block that exists: align it, or refuse a first takeover. */
function planExisting(
  tagBlock: Pick<Block, "id" | "properties">,
  cache: TaskTagCache | undefined,
  uiLanguage: NoteLanguage,
): StartupPlan {
  const byName = new Map(tagBlock.properties.map((p) => [p.name, p]));
  const language = tagLanguage(tagBlock.properties, uiLanguage);
  // Definitions are in `propertyKeys` order (their index is `pos`).
  const expectedDefinitions = taskTagDefinitions(language);
  const conflicting: PropertyKey[] = [];
  const writes: PropertyDefinition[] = [];
  propertyKeys.forEach((key, pos) => {
    const expected = expectedDefinitions[pos];
    if (!expected) return;
    const existing = byName.get(expected.name);
    if (!existing) {
      writes.push(expected);
    } else if (conflicts(existing, expected)) {
      conflicting.push(key);
    } else {
      const write = alignProperty(existing, expected);
      if (write) writes.push(write);
    }
  });
  const firstTakeover = cache?.tagBlockId !== tagBlock.id;
  if (firstTakeover && conflicting.length > 0) {
    return {
      action: { kind: "refuse", conflicts: conflicting, language },
      writes: [],
    };
  }
  return {
    action: {
      kind: "use",
      tagBlockId: tagBlock.id,
      invalidated: conflicting,
      language,
    },
    writes,
  };
}

export function planStartup(input: StartupInput): StartupPlan {
  const { tagBlock, cache, cachedBlock } = input;
  if (tagBlock) return planExisting(tagBlock, cache, input.uiLanguage);
  // Recovery: the cached block is still the tag under the cached name.
  if (
    cache &&
    cachedBlock?.id === cache.tagBlockId &&
    cachedBlock.aliases.includes(cache.tagName)
  ) {
    const plan = planExisting(cachedBlock, cache, input.uiLanguage);
    if (plan.action.kind === "use") {
      return {
        action: {
          ...plan.action,
          kind: "rename",
          from: cache.tagName,
          to: input.tagName,
        },
        writes: plan.writes,
      };
    }
  }
  return {
    action: { kind: "create", tagName: input.tagName },
    writes: taskTagDefinitions(input.uiLanguage),
  };
}
