// Thin Orca side of the startup plan: gathers the plan's input and executes
// its output. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { Block, DbId } from "../../../orca.d.ts";
import { describeError } from "../../../shared/describe-error";
import type { NoteLanguage } from "../codec/names";
import { OrcaError } from "../orca-error";
import { planStartup, type StartupPlan } from "./startup-plan";

const editor = (command: string, ...args: unknown[]): Promise<unknown> =>
  orca.commands.invokeEditorCommand(command, null, ...args);

/** The block whose alias is `name`, or `undefined` when there is none. */
async function findTagBlock(name: string): Promise<Block | undefined> {
  const found = await orca.invokeBackend("get-blockid-by-alias", name);
  const id: unknown = found?.id;
  if (typeof id !== "number") return undefined;
  const block: Block | null | undefined = await orca.invokeBackend(
    "get-block",
    id,
  );
  return block ?? undefined;
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
 * Finds or creates the task tag named `tagName` and brings it to the planned
 * structure. Returns the tag block ID. Throws an `OrcaError` on failure.
 */
export async function runStartupPlan(
  tagName: string,
  uiLanguage: NoteLanguage,
): Promise<DbId> {
  try {
    const tagBlock = await findTagBlock(tagName);
    const plan = planStartup({ tagName, tagBlock, uiLanguage });
    switch (plan.action.kind) {
      case "create":
        return await createTag(plan, plan.action.tagName);
      case "use":
        if (plan.writes.length > 0) {
          await editor(
            "core.editor.setProperties",
            [plan.action.tagBlockId],
            plan.writes,
          );
        }
        return plan.action.tagBlockId;
    }
  } catch (error) {
    throw error instanceof OrcaError
      ? error
      : new OrcaError(describeError(error));
  }
}
