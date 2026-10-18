// Where "Extract tasks" (#204) starts: the block menu, for the one block
// right-clicked or the blocks selected (worksOnMultipleBlocks, in note order,
// orca-ai D), and an editor command for the block at the cursor, which the
// `/` menu calls too (slash-commands). They only open the window; nothing is
// written here. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { BlockMenuCommand, EditorCommandFn } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import type { OpenExtractTasks } from "../extract/extract-tasks-window";
import { createNotify } from "../notify";

export function createExtractTasksBlockMenuCommand(deps: {
  open: OpenExtractTasks;
  /** The task tag block's ID; `undefined` while task features are paused. */
  taskTagBlockId: () => number | undefined;
}): BlockMenuCommand {
  return {
    worksOnMultipleBlocks: true,
    render: (blockIds: number[], _rootBlockId: number, close: () => void) => {
      // Nothing can be written while paused: no entry on every right-click.
      if (deps.taskTagBlockId() === undefined) return null;
      const { MenuText } = orca.components;
      return (
        <MenuText
          title={t("Extract tasks")}
          preIcon="ti ti-sparkles"
          onClick={() => {
            close();
            deps.open(blockIds);
          }}
        />
      );
    },
  };
}

export function createExtractTasksEditorCommand(
  open: OpenExtractTasks,
  pluginName: string,
): EditorCommandFn {
  return async ([, , cursor]) => {
    const id = cursor?.anchor.blockId;
    if (id === undefined) {
      createNotify(pluginName)(
        "warn",
        t("Put the cursor in a block to extract tasks from it."),
      );
    } else {
      open([id]);
    }
    // Only opens the window: nothing for Orca to undo.
    return null;
  };
}
