// The plugin's calls into Orca, each turning a failure into an `OrcaError`.
// Thin Orca side; verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { APIMsg, ColumnPanel, RowPanel, ViewPanel } from "../../orca.d.ts";
import { describeError } from "../../shared/describe-error";
import { OrcaError } from "./orca-error";

/** Calls a backend API. */
export async function invokeBackend(
  type: APIMsg,
  ...args: unknown[]
): Promise<unknown> {
  try {
    return await orca.invokeBackend(type, ...args);
  } catch (error) {
    throw new OrcaError(`${type} failed: ${describeError(error)}`);
  }
}

/**
 * Runs an editor command without a cursor, through a note panel
 * (`inNotePanel`): from the plugin panel it would silently write nothing.
 * Inside `invokeGroup` the note panel is already the active one.
 */
export async function invokeEditorCommand(
  command: string,
  ...args: unknown[]
): Promise<unknown> {
  try {
    return await inNotePanel(() =>
      orca.commands.invokeEditorCommand(command, null, ...args),
    );
  } catch (error) {
    if (error instanceof OrcaError) throw error;
    throw new OrcaError(`${command} failed: ${describeError(error)}`);
  }
}

type AnyPanel = RowPanel | ColumnPanel | ViewPanel;

/** Views with a block editor, which Orca writes through (plugin-panel-writes). */
const noteViews: readonly string[] = ["journal", "block"];

function isNotePanel(id: string): boolean {
  const panel = orca.nav.findViewPanel(id, orca.state.panels);
  return panel !== null && noteViews.includes(panel.view);
}

/**
 * A note panel to write through: the most recently active one still open,
 * else the first in the layout.
 */
function findNotePanel(): string | undefined {
  const history = orca.state.panelBackHistory;
  for (let i = history.length - 1; i >= 0; i--) {
    const id = history[i]?.activePanel;
    if (id !== undefined && isNotePanel(id)) return id;
  }
  const walk = (panel: AnyPanel): string | undefined => {
    if (!("children" in panel)) {
      return noteViews.includes(panel.view) ? panel.id : undefined;
    }
    for (const child of panel.children) {
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  };
  return walk(orca.state.panels);
}

/**
 * Makes a note panel the active one for the length of `run`, then gives the
 * focus back. Orca's `invokeGroup` and editor commands write through the
 * active panel's editor: from the plugin panel, `invokeGroup` throws and an
 * editor command writes nothing (plugin-panel-writes). The undo step is recorded
 * in that note panel.
 */
async function inNotePanel<T>(run: () => Promise<T>): Promise<T> {
  const previous = orca.state.activePanel;
  if (isNotePanel(previous)) return run();
  const target = findNotePanel();
  if (target === undefined) {
    throw new OrcaError("no journal or block panel is open to write through");
  }
  // The element the user is in (e.g. the task panel popup), so switching
  // panels does not leave keys going to the editor behind it.
  const focused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
  // The switch took effect at once in plugin-panel-writes (f); a group that
  // still finds no editor is caught by `invokeGroup`'s "did not run".
  orca.nav.switchFocusTo(target);
  try {
    return await run();
  } finally {
    // Only if nothing else moved the focus meanwhile.
    if (
      orca.state.activePanel === target &&
      orca.nav.findViewPanel(previous, orca.state.panels)
    ) {
      orca.nav.switchFocusTo(previous);
    }
    if (focused?.isConnected && document.activeElement !== focused) {
      focused.focus({ preventScroll: true });
    }
  }
}

/**
 * Runs `write` as one undo step (tag-operations, round 2 F1/F2), through a
 * note panel (`inNotePanel`). Whether `invokeGroup` rethrows an error from
 * its callback is not measured, so the failure is carried out of the group
 * and thrown after it. Orca skips the callback when the active panel has no
 * view state (its source, plugin-panel-writes), so a write that never ran fails.
 */
export async function invokeGroup(write: () => Promise<void>): Promise<void> {
  let ran = false;
  let failure: { error: unknown } | undefined;
  try {
    await inNotePanel(() =>
      orca.commands.invokeGroup(async () => {
        ran = true;
        try {
          await write();
        } catch (error) {
          failure = { error };
        }
      }),
    );
  } catch (error) {
    if (error instanceof OrcaError) throw error;
    throw new OrcaError(`invokeGroup failed: ${describeError(error)}`);
  }
  if (failure) {
    throw failure.error instanceof OrcaError
      ? failure.error
      : new OrcaError(describeError(failure.error));
  }
  if (!ran) throw new OrcaError("invokeGroup did not run the write");
}

/** The ID of the block whose alias is `name`, or `undefined` when there is none. */
export async function findAliasOwner(
  name: string,
): Promise<number | undefined> {
  const found = await invokeBackend("get-blockid-by-alias", name);
  const id: unknown =
    typeof found === "object" && found !== null && "id" in found
      ? found.id
      : undefined;
  return typeof id === "number" ? id : undefined;
}
