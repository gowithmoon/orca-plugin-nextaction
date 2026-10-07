// Alias lookups and renames for the task tag. Thin Orca side; verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import { describeError } from "../../../shared/describe-error";
import { findAliasOwner, invokeEditorCommand } from "../orca-calls";
import { OrcaError } from "../orca-error";
import { planRename, type RenamePlan } from "./rename-plan";
import { type TaskTagCache, writeTaskTagCache } from "./task-tag-cache";

/**
 * Renames the tag's alias with `renameAlias` (ADR 0002): the block, its
 * properties and every task's reference stay as they are (tag-operations
 * spike). Checked afterwards, since what `renameAlias` returns on failure is
 * not measured.
 */
export async function renameTagAlias(
  tagBlockId: number,
  from: string,
  to: string,
): Promise<void> {
  // Succeeds with "" (tag-operations spike); anything else is a failure.
  const result = await invokeEditorCommand("core.editor.renameAlias", from, to);
  if (result) {
    throw new OrcaError(
      `renameAlias "${from}" → "${to}" returned ${JSON.stringify(result)}`,
    );
  }
  const owner = await findAliasOwner(to);
  if (owner !== tagBlockId) {
    throw new OrcaError(
      `after renameAlias, "${to}" belongs to ${owner ?? "no block"} instead of ${tagBlockId}`,
    );
  }
}

/**
 * Checks the name now in the settings against the tag in use and, when it is
 * a valid new name, renames the tag and records it in the cache. Returns the
 * plan so the caller can update its state, or set the settings back and tell
 * the user. Throws an `OrcaError` when Orca fails.
 */
export async function applyRename(
  pluginName: string,
  current: TaskTagCache,
  requested: unknown,
): Promise<RenamePlan> {
  try {
    const name = typeof requested === "string" ? requested.trim() : "";
    const newNameOwner =
      name === "" || name === current.tagName
        ? undefined
        : await findAliasOwner(name);
    const plan = planRename({ current, requested, newNameOwner });
    if (plan.kind === "rename") {
      await renameTagAlias(current.tagBlockId, plan.from, plan.to);
      await writeTaskTagCache(pluginName, current, {
        tagBlockId: current.tagBlockId,
        tagName: plan.to,
      });
    }
    return plan;
  } catch (error) {
    throw error instanceof OrcaError
      ? error
      : new OrcaError(describeError(error));
  }
}
