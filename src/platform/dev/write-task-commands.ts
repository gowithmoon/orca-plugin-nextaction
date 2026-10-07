// Development builds only (spec #16, #22): commands that write to the task at
// the cursor through the repository, to check writes by hand in Orca. Removed
// in step 3 once real commands exist.
import type { Clock } from "../../application/ports/clock";
import type { TaskRepository } from "../../application/ports/task-repository";
import type { CalendarDate } from "../../domain/task/task";
import type { EditorCommandFn } from "../../orca.d.ts";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import type { Registry } from "../registry";

/** A key for testing only; real keys (completion history…) come later. */
const testKey = "debug.test";

/**
 * Tomorrow's natural local date. The logical day (day boundary) arrives in
 * step 3; until then the natural date is good enough for a debug command.
 */
function tomorrow(clock: Clock): CalendarDate {
  const now = clock.now();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    year: next.getFullYear(),
    month: next.getMonth() + 1,
    day: next.getDate(),
  };
}

/** The block a command acts on: an explicit ID, else the cursor's block. */
function targetId(
  cursorBlockId: number | undefined,
  explicitId: unknown,
): number | undefined {
  return typeof explicitId === "number" ? explicitId : cursorBlockId;
}

/**
 * Registers `<pluginName>.debug.setImportanceAndDue` and
 * `<pluginName>.debug.writeTestProperty`. Run them from the command palette
 * with the cursor in a task, or from the console with a block ID:
 * `orca.commands.invokeEditorCommand("<pluginName>.debug.setImportanceAndDue", null, 201)`.
 */
export function registerWriteTaskCommands(
  registry: Registry,
  repository: TaskRepository,
  clock: Clock,
): void {
  const setImportanceAndDue: EditorCommandFn = async (
    [, , cursor],
    explicitId?: unknown,
  ) => {
    const id = targetId(cursor?.anchor.blockId, explicitId);
    if (id === undefined) {
      console.warn(
        "[nextaction] set importance and due: no block ID and no cursor",
      );
      return null;
    }
    try {
      const due = tomorrow(clock);
      await repository.updateTask(id, { importance: 6, due });
      console.log(
        `[nextaction] block ${id}: importance 6, due ${due.year}-${due.month}-${due.day}`,
        await repository.getTask(id),
      );
    } catch (error) {
      console.error(
        `[nextaction] set importance and due of ${id} failed: ${describeError(error)}`,
        error,
      );
    }
    // The repository's own invokeGroup is the undo unit.
    return null;
  };
  registry.editorCommand(
    "debug.setImportanceAndDue",
    setImportanceAndDue,
    () => undefined,
    {
      label: t("Set importance 6 and due tomorrow (debug)"),
      hasArgs: true,
    },
  );

  // Reads the test property, writes it back with a higher count, reads it
  // again. An unreadable value is reported and left as it is.
  const writeTestProperty: EditorCommandFn = async (
    [, , cursor],
    explicitId?: unknown,
  ) => {
    const id = targetId(cursor?.anchor.blockId, explicitId);
    if (id === undefined) {
      console.warn(
        "[nextaction] write test property: no block ID and no cursor",
      );
      return null;
    }
    try {
      const before = await repository.readPluginBlockProperty(id, testKey);
      console.log(`[nextaction] block ${id}: ${testKey} before`, before);
      const count =
        before.kind === "present" && typeof before.data.count === "number"
          ? before.data.count + 1
          : 1;
      await repository.writePluginBlockProperty(id, testKey, {
        count,
        at: clock.now().toISOString(),
      });
      console.log(
        `[nextaction] block ${id}: ${testKey} after`,
        await repository.readPluginBlockProperty(id, testKey),
      );
    } catch (error) {
      console.error(
        `[nextaction] write test property of ${id} failed: ${describeError(error)}`,
        error,
      );
    }
    return null;
  };
  registry.editorCommand(
    "debug.writeTestProperty",
    writeTestProperty,
    () => undefined,
    {
      label: t("Read and write a test plugin block property (debug)"),
      hasArgs: true,
    },
  );
}
