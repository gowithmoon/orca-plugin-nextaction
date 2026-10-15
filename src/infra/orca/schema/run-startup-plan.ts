// Thin Orca side of the startup plan: gathers the plan's input and executes
// its output. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { Block, DbId } from "../../../orca.d.ts";
import { describeError } from "../../../shared/describe-error";
import type { NoteLanguage } from "../codec/names";
import {
  findAliasOwner,
  invokeBackend,
  invokeEditorCommand,
  invokeGroup,
} from "../orca-calls";
import { OrcaError } from "../orca-error";
import { planStartup, type StartupPlan } from "./startup-plan";
import { renameTagAlias } from "./tag-alias";
import { type TagCache, writeTagCache } from "./tag-cache";
import type { TagSchema } from "./tag-schema";
import type { TagState } from "./tag-state";

/** The block with ID `id`, or `undefined` when there is none. */
async function readBlock(id: number): Promise<Block | undefined> {
  const block = (await invokeBackend("get-block", id)) as
    | Block
    | null
    | undefined;
  return block ?? undefined;
}

/** The block whose alias is `name`, or `undefined` when there is none. */
async function findTagBlock(name: string): Promise<Block | undefined> {
  const id = await findAliasOwner(name);
  return id === undefined ? undefined : readBlock(id);
}

/**
 * Creates the tag block, its alias and its property definitions as one undo
 * step. When a step after `insertBlock` fails, the inserted block is deleted
 * again, so no empty block without an alias is left behind. Whether
 * `invokeGroup` rolls back on its own is not measured.
 */
async function createTag(
  plan: StartupPlan<string>,
  tagName: string,
): Promise<DbId> {
  let tagBlockId: DbId | undefined;
  await invokeGroup(async () => {
    const id = await invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      null,
      [{ t: "t", v: tagName }],
    );
    if (typeof id !== "number") {
      throw new OrcaError(`insertBlock returned ${JSON.stringify(id)}`);
    }
    try {
      // Succeeds with "" (tag-operations); documented to return an error
      // object when the name is taken.
      const aliasError = await invokeEditorCommand(
        "core.editor.createAlias",
        tagName,
        id,
      );
      if (aliasError) {
        throw new OrcaError(
          `createAlias "${tagName}" failed: ${JSON.stringify(aliasError)}`,
        );
      }
      await invokeEditorCommand("core.editor.setProperties", [id], plan.writes);
    } catch (error) {
      try {
        await invokeEditorCommand("core.editor.deleteBlocks", [id]);
      } catch (cleanup) {
        throw new OrcaError(
          `${describeError(error)}; deleting the new block ${id} also failed: ${describeError(cleanup)}`,
        );
      }
      throw error;
    }
    tagBlockId = id;
  });
  if (tagBlockId === undefined) {
    throw new OrcaError(`the tag block "${tagName}" was not created`);
  }
  return tagBlockId;
}

/** What startup settled on. */
export interface StartupOutcome<K extends string> {
  /**
   * Where the tag stands: `ready` (possibly with invalidated properties) or
   * `paused` because the takeover was refused.
   */
  state: TagState<K>;
  /**
   * Set when the name in the settings was changed while the plugin was off
   * to a name another block has: the cached tag was kept under its name, and
   * the caller writes that name back to the settings and tells the user.
   */
  reverted?: { requested: string };
}

/**
 * Finds or creates the tag of `schema` named `tagName` (renaming the cached
 * tag when the name was changed while the plugin was off, or keeping it when
 * that name is taken) and brings it to the planned structure. The cache is
 * kept under `cacheKey`. Throws an `OrcaError` on failure.
 */
export async function runStartupPlan<K extends string>(
  schema: TagSchema<K>,
  pluginName: string,
  cacheKey: string,
  tagName: string,
  uiLanguage: NoteLanguage,
  cache: TagCache | undefined,
): Promise<StartupOutcome<K>> {
  try {
    const tagBlock = await findTagBlock(tagName);
    // Only needed when the name from the settings is not the cached tag's:
    // to rename the cached tag, or to keep it when the name is taken.
    const cachedBlock =
      cache !== undefined && tagBlock?.id !== cache.tagBlockId
        ? await readBlock(cache.tagBlockId)
        : undefined;
    const plan = planStartup(schema, {
      tagName,
      tagBlock,
      cache,
      cachedBlock,
      uiLanguage,
    });
    const { action } = plan;
    switch (action.kind) {
      case "refuse":
        // Nothing is written, not even the cache: the tag is not ours.
        return {
          state: {
            kind: "paused",
            reason: "refused",
            tagName,
            language: action.language,
            conflicts: action.conflicts,
          },
        };
      case "create": {
        const tagBlockId = await createTag(plan, action.tagName);
        await writeTagCache(pluginName, cacheKey, cache, {
          tagBlockId,
          tagName,
        });
        return {
          state: {
            kind: "ready",
            tagBlockId,
            tagName,
            language: uiLanguage,
            invalidated: [],
          },
        };
      }
      case "rename":
      case "revert":
      case "use": {
        // One undo step for the rename and the alignment (ARCHITECTURE §4).
        await invokeGroup(async () => {
          if (action.kind === "rename") {
            await renameTagAlias(action.tagBlockId, action.from, action.to);
          }
          if (plan.writes.length > 0) {
            await invokeEditorCommand(
              "core.editor.setProperties",
              [action.tagBlockId],
              plan.writes,
            );
          }
        });
        // A kept tag keeps its name; the name from the settings is not used.
        const nameInUse = action.kind === "revert" ? action.tagName : tagName;
        // Recorded after alignment, so a takeover that failed half-way is
        // checked as a first takeover again next time.
        await writeTagCache(pluginName, cacheKey, cache, {
          tagBlockId: action.tagBlockId,
          tagName: nameInUse,
        });
        return {
          state: {
            kind: "ready",
            tagBlockId: action.tagBlockId,
            tagName: nameInUse,
            language: action.language,
            invalidated: action.invalidated,
          },
          ...(action.kind === "revert"
            ? { reverted: { requested: action.requested } }
            : {}),
        };
      }
    }
  } catch (error) {
    throw error instanceof OrcaError
      ? error
      : new OrcaError(describeError(error));
  }
}
