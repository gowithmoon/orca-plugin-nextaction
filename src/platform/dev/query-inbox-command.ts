// Development builds only (spec #16, #21): a command that queries every task
// in the inbox and prints the result to the console. Removed in step 3 once
// real views exist.
import type { TaskRepository } from "../../application/ports/task-repository";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Registry } from "../registry";

/**
 * Registers `<pluginName>.debug.queryInboxTasks`. Run it from the command
 * palette, or from the console:
 * `orca.commands.invokeCommand("<pluginName>.debug.queryInboxTasks")`.
 */
export function registerQueryInboxCommand(
  registry: Registry,
  repository: TaskRepository,
): void {
  registry.command(
    "debug.queryInboxTasks",
    async () => {
      try {
        const tasks = await repository.queryTasks({ statuses: ["inbox"] });
        console.log(`[nextaction] ${tasks.length} inbox tasks`, tasks);
      } catch (error) {
        console.error(
          `[nextaction] query inbox tasks failed: ${describeError(error)}`,
          error,
        );
      }
    },
    t("Query inbox tasks (debug)"),
  );
}
