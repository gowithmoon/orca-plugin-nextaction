// Development builds only (spec #16, #20): a command that reads the block at
// the cursor as a task and prints the result to the console. Removed in step 3
// once real commands exist.
import type { TaskRepository } from "../../application/ports/task-repository";
import type { EditorCommandFn } from "../../orca.d.ts";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Registry } from "../registry";

/**
 * Registers `<pluginName>.debug.readTask`. Run it from the command palette
 * with the cursor in a block, or from the console with an explicit block ID:
 * `orca.commands.invokeEditorCommand("<pluginName>.debug.readTask", null, 201)`.
 */
export function registerReadTaskCommand(
  registry: Registry,
  repository: TaskRepository,
): void {
  const read: EditorCommandFn = async ([, , cursor], explicitId?: unknown) => {
    const id =
      typeof explicitId === "number" ? explicitId : cursor?.anchor.blockId;
    if (id === undefined) {
      console.warn("[nextaction] read task: no block ID and no cursor");
      return null;
    }
    try {
      const task = await repository.getTask(id);
      console.log(
        task
          ? `[nextaction] block ${id} reads as task`
          : `[nextaction] block ${id} is not a task`,
        task,
      );
    } catch (error) {
      console.error(
        `[nextaction] read task ${id} failed: ${describeError(error)}`,
        error,
      );
    }
    // Reads only: nothing to undo.
    return null;
  };
  registry.editorCommand("debug.readTask", read, () => undefined, {
    label: t("Read current block as task (debug)"),
    hasArgs: true,
  });
}
