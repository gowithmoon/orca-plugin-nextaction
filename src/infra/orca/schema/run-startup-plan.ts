// Thin Orca side of the startup plan: gathers the plan's input and executes
// its output. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { Block, DbId } from "../../../orca.d.ts";
import { describeError } from "../../../shared/describe-error";
import type { NoteLanguage } from "../codec/names";
import { OrcaError } from "../orca-error";
import {
  planStartup,
  type StartupPlan,
  type TaskTagCache,
} from "./startup-plan";
import { renameTagAlias } from "./tag-alias";
import { writeTaskTagCache } from "./task-tag-cache";
import type { TaskTagState } from "./task-tag-state";

const editor = (command: string, ...args: unknown[]): Promise<unknown> =>
  orca.commands.invokeEditorCommand(command, null, ...args);

/** The block with ID `id`, or `undefined` when there is none. */
async function readBlock(id: number): Promise<Block | undefined> {
  const block: Block | null | undefined = await orca.invokeBackend(
    "get-block",
    id,
  );
  return block ?? undefined;
}

/** The block whose alias is `name`, or `undefined` when there is none. */
async function findTagBlock(name: string): Promise<Block | undefined> {
  const found = await orca.invokeBackend("get-blockid-by-alias", name);
  const id: unknown = found?.id;
  return typeof id === "number" ? readBlock(id) : undefined;
}

/** Creates the tag block, its alias and its property definitions. */
async function createTag(plan: StartupPlan, tagName: string): Promise<DbId> {
  // Results and failures are carried out of the group explicitly: whether
  // invokeGroup rethrows an error from its callback is not measured.
  let tagBlockId: DbId | undefined;
  let failure: unknown;
  await orca.commands.invokeGroup(async () => {
    try {
      const id = await editor("core.editor.insertBlock", null, null, [
        { t: "t", v: tagName },
      ]);
      if (typeof id !== "number") {
        throw new OrcaError(`insertBlock returned ${JSON.stringify(id)}`);
      }
      tagBlockId = id;
      // Succeeds with "" (tag-operations); documented to return an error
      // object when the name is taken.
      const aliasError = await editor("core.editor.createAlias", tagName, id);
      if (aliasError) {
        throw new OrcaError(
          `createAlias "${tagName}" failed: ${JSON.stringify(aliasError)}`,
        );
      }
      await editor("core.editor.setProperties", [id], plan.writes);
    } catch (error) {
      failure = error;
    }
  });
  if (failure !== undefined) throw failure;
  if (tagBlockId === undefined) {
    throw new OrcaError("the task tag block was not created");
  }
  return tagBlockId;
}

/**
 * Finds or creates the task tag named `tagName` (renaming the cached tag when
 * the name was changed while the plugin was off) and brings it to the planned
 * structure. Returns where the tag stands: `ready` (possibly with invalidated
 * properties) or `paused` because the takeover was refused. Throws an
 * `OrcaError` on failure.
 */
export async function runStartupPlan(
  pluginName: string,
  tagName: string,
  uiLanguage: NoteLanguage,
  cache: TaskTagCache | undefined,
): Promise<TaskTagState> {
  try {
    const tagBlock = await findTagBlock(tagName);
    // Only needed for rename recovery: no block has the name from the settings.
    const cachedBlock =
      tagBlock === undefined && cache !== undefined
        ? await readBlock(cache.tagBlockId)
        : undefined;
    const plan = planStartup({
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
          kind: "paused",
          reason: "refused",
          tagName,
          language: action.language,
          conflicts: action.conflicts,
        };
      case "create": {
        const tagBlockId = await createTag(plan, action.tagName);
        await writeTaskTagCache(pluginName, cache, { tagBlockId, tagName });
        return {
          kind: "ready",
          tagBlockId,
          tagName,
          language: uiLanguage,
          invalidated: [],
        };
      }
      case "rename":
      case "use":
        if (action.kind === "rename") {
          await renameTagAlias(action.tagBlockId, action.from, action.to);
        }
        if (plan.writes.length > 0) {
          await editor(
            "core.editor.setProperties",
            [action.tagBlockId],
            plan.writes,
          );
        }
        // Recorded after alignment, so a takeover that failed half-way is
        // checked as a first takeover again next time.
        await writeTaskTagCache(pluginName, cache, {
          tagBlockId: action.tagBlockId,
          tagName,
        });
        return {
          kind: "ready",
          tagBlockId: action.tagBlockId,
          tagName,
          language: action.language,
          invalidated: action.invalidated,
        };
    }
  } catch (error) {
    throw error instanceof OrcaError
      ? error
      : new OrcaError(describeError(error));
  }
}
