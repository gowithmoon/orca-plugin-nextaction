// The startup plan: given what was found in the notes, decide what to do with
// one plugin tag and which property definitions to write. The tag's structure
// comes from its `TagSchema` (#141). Pure; executing the plan against Orca
// lives in ./run-startup-plan.ts.
import type { Block, BlockProperty } from "../../../orca.d.ts";
import type { NoteLanguage } from "../codec/names";
import type { TagCache } from "./tag-cache";
import type { PropertyDefinition, TagSchema } from "./tag-schema";

export interface StartupInput {
  /** The tag name from the settings, already resolved (never empty). */
  tagName: string;
  /** The block whose alias is `tagName`, if any. */
  tagBlock: Pick<Block, "id" | "properties"> | undefined;
  /** This repo's cache; `undefined` when there is none (or it is unreadable). */
  cache: TagCache | undefined;
  /**
   * The block the cache points at, read only when `tagBlock` is not that
   * block; `undefined` when it was not read or no longer exists. Block IDs
   * are reused (tag-operations spike), so it is checked, not trusted.
   */
  cachedBlock?: Pick<Block, "id" | "aliases" | "properties"> | undefined;
  /** Language of the current interface; used only for names of new things. */
  uiLanguage: NoteLanguage;
}

export type StartupAction<K extends string> =
  | { kind: "create"; tagName: string }
  /**
   * A tag of that name exists but was never taken over here, and some of its
   * properties conflict: leave it alone; the tag's features are paused
   * (ADR 0008).
   */
  | { kind: "refuse"; conflicts: K[]; language: NoteLanguage }
  | {
      kind: "use";
      tagBlockId: number;
      /** Plugin properties whose definition conflicts with the plugin's. */
      invalidated: K[];
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
      invalidated: K[];
      language: NoteLanguage;
    }
  /**
   * The name was changed in the settings while the plugin was off, to a name
   * another block already has: keep using the cached tag under `tagName`, as
   * with `use`, write `tagName` back to the settings and tell the user
   * (ADR 0002). That block is not taken over.
   */
  | {
      kind: "revert";
      tagBlockId: number;
      tagName: string;
      requested: string;
      invalidated: K[];
      language: NoteLanguage;
    };

export interface StartupPlan<K extends string> {
  action: StartupAction<K>;
  /** Property definitions to write to the tag block, each complete with `pos`. */
  writes: PropertyDefinition[];
}

type TypeArgs = Record<string, unknown>;

/** A choice's name: `n` of an object choice, or a string choice itself. */
export const choiceName = (choice: unknown): unknown =>
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
function tagLanguage<K extends string>(
  schema: TagSchema<K>,
  properties: readonly BlockProperty[],
  uiLanguage: NoteLanguage,
): NoteLanguage {
  const counts: Record<NoteLanguage, number> = { zh: 0, en: 0 };
  for (const property of properties) {
    const match = schema.findPropertyKey(property.name);
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

/**
 * Plan for a tag block that exists, to be used under `tagName`: align it, or
 * refuse a first takeover.
 */
function planExisting<K extends string>(
  schema: TagSchema<K>,
  tagBlock: Pick<Block, "id" | "properties">,
  tagName: string,
  cache: TagCache | undefined,
  uiLanguage: NoteLanguage,
): StartupPlan<K> {
  const byName = new Map(tagBlock.properties.map((p) => [p.name, p]));
  const language = tagLanguage(schema, tagBlock.properties, uiLanguage);
  // Definitions are in `keys` order (their index is `pos`).
  const expectedDefinitions = schema.definitions(language, tagName);
  const conflicting: K[] = [];
  const writes: PropertyDefinition[] = [];
  schema.keys.forEach((key, pos) => {
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

export function planStartup<K extends string>(
  schema: TagSchema<K>,
  input: StartupInput,
): StartupPlan<K> {
  const { tagBlock, cache, cachedBlock } = input;
  // The cached block is still the tag under the cached name.
  const cachedTag =
    cache &&
    cachedBlock?.id === cache.tagBlockId &&
    cachedBlock.aliases.includes(cache.tagName)
      ? cachedBlock
      : undefined;
  if (tagBlock) {
    if (cache && cachedTag && tagBlock.id !== cachedTag.id) {
      // The cached tag keeps its name.
      const plan = planExisting(
        schema,
        cachedTag,
        cache.tagName,
        cache,
        input.uiLanguage,
      );
      if (plan.action.kind === "use") {
        return {
          action: {
            ...plan.action,
            kind: "revert",
            tagName: cache.tagName,
            requested: input.tagName,
          },
          writes: plan.writes,
        };
      }
    }
    return planExisting(
      schema,
      tagBlock,
      input.tagName,
      cache,
      input.uiLanguage,
    );
  }
  // Recovery: rename the cached tag to the name from the settings.
  if (cache && cachedTag) {
    // Renamed before the writes, in the same group (run-startup-plan).
    const plan = planExisting(
      schema,
      cachedTag,
      input.tagName,
      cache,
      input.uiLanguage,
    );
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
    writes: schema.definitions(input.uiLanguage, input.tagName),
  };
}
