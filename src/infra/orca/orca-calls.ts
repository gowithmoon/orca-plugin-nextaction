// The plugin's calls into Orca, each turning a failure into an `OrcaError`.
// Thin Orca side; verified by hand in Orca (docs/ARCHITECTURE.md §5).

import { NoNotePanelError } from "../../application/ports/task-repository";
import type {
  APIMsg,
  Block,
  ColumnPanel,
  RowPanel,
  ViewPanel,
} from "../../orca.d.ts";
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
 * Runs an editor command without a cursor, through a panel with an editor
 * (`withEditor`): without one it would silently write nothing. Inside
 * `invokeGroup` that panel is already the active one.
 */
export async function invokeEditorCommand(
  command: string,
  ...args: unknown[]
): Promise<unknown> {
  try {
    return await withEditor(() =>
      orca.commands.invokeEditorCommand(command, null, ...args),
    );
  } catch (error) {
    if (error instanceof OrcaError || error instanceof NoNotePanelError) {
      throw error;
    }
    throw new OrcaError(`${command} failed: ${describeError(error)}`);
  }
}

// The same walk as platform/panel-tree.ts, which infra may not import.
type AnyPanel = RowPanel | ColumnPanel | ViewPanel;

/**
 * Orca runs editor commands and `invokeGroup` through the active panel's
 * editor (`viewState.editor`, plugin-panel-writes). Journal and block panels
 * have one; the plugin panel has one through the editor it hides.
 */
function hasEditor(panel: ViewPanel | null): boolean {
  const editor: unknown = panel?.viewState?.editor;
  return typeof editor === "object" && editor !== null;
}

function panelHasEditor(id: string): boolean {
  return hasEditor(orca.nav.findViewPanel(id, orca.state.panels));
}

/**
 * A panel to write through: the most recently active one still open with an
 * editor, else the first in the layout.
 */
function findEditorPanel(): string | undefined {
  const history = orca.state.panelBackHistory;
  for (let i = history.length - 1; i >= 0; i--) {
    const id = history[i]?.activePanel;
    if (id !== undefined && panelHasEditor(id)) return id;
  }
  const walk = (panel: AnyPanel): string | undefined => {
    if (!("children" in panel)) return hasEditor(panel) ? panel.id : undefined;
    for (const child of panel.children) {
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  };
  return walk(orca.state.panels);
}

/**
 * While writes are under way through a panel switched to: the panel and
 * element to give the focus back to once the last of them ends. Writes can
 * overlap (e.g. a note saved on blur while a status is chosen); switching
 * back after the first would leave the others writing nothing.
 */
let switched:
  | { count: number; previous: string; focused: HTMLElement | undefined }
  | undefined;

/**
 * Runs `run` with a panel that has an editor as the active one. Usually the
 * active panel has one (a note panel, or the plugin panel); otherwise one is
 * made active for the length of `run` and the focus given back afterwards.
 * The undo step is recorded in that panel and undone from it
 * (plugin-panel-writes, round 3).
 */
async function withEditor<T>(run: () => Promise<T>): Promise<T> {
  if (switched) {
    switched.count += 1;
  } else {
    if (panelHasEditor(orca.state.activePanel)) return run();
    const target = findEditorPanel();
    if (target === undefined) {
      throw new NoNotePanelError("no panel with an editor is open");
    }
    switched = {
      count: 1,
      previous: orca.state.activePanel,
      // The element the user is in, so switching panels does not leave keys
      // going to the editor of the panel switched to.
      focused:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined,
    };
    // Takes effect at once and adds no back history (plugin-panel-writes);
    // checked all the same, as an editor command would otherwise write
    // nothing without a word.
    orca.nav.switchFocusTo(target);
    if (orca.state.activePanel !== target) {
      switched = undefined;
      throw new OrcaError(`could not make panel ${target} the active panel`);
    }
  }
  try {
    return await run();
  } finally {
    const current = switched;
    if (current) current.count -= 1;
    if (current && current.count === 0) {
      switched = undefined;
      if (orca.nav.findViewPanel(current.previous, orca.state.panels)) {
        orca.nav.switchFocusTo(current.previous);
      }
      const { focused } = current;
      if (focused?.isConnected && document.activeElement !== focused) {
        focused.focus({ preventScroll: true });
      }
    }
  }
}

/**
 * Runs `write` as one undo step (tag-operations, round 2 F1/F2), through a
 * panel with an editor (`withEditor`). Whether `invokeGroup` rethrows an error from
 * its callback is not measured, so the failure is carried out of the group
 * and thrown after it. Orca skips the callback when the active panel has no
 * view state (its source, plugin-panel-writes), so a write that never ran
 * fails.
 */
export async function invokeGroup(write: () => Promise<void>): Promise<void> {
  let ran = false;
  let failure: { error: unknown } | undefined;
  try {
    await withEditor(() =>
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
    if (error instanceof OrcaError || error instanceof NoNotePanelError) {
      throw error;
    }
    throw new OrcaError(`invokeGroup failed: ${describeError(error)}`);
  }
  if (failure) {
    throw failure.error instanceof OrcaError
      ? failure.error
      : new OrcaError(describeError(failure.error));
  }
  if (!ran) throw new OrcaError("invokeGroup did not run the write");
}

/**
 * Moves block `id`, with every block below it, to `placement` relative to
 * block `target`, as one undo step (move-blocks). `moveBlocks` places the
 * block at the root, without a word, when the target is not in
 * `orca.state.blocks`, so a target missing there is fetched with `get-block`
 * and put there first; one already there is left as it is. `autoMatchType`
 * is not passed, so the block keeps its type. Orca's refusal to move a block
 * onto itself or below it (`MovingBlockToSelfOrItsDescendant`) comes out as
 * an `OrcaError`, nothing written.
 */
export async function moveBlocks(
  id: number,
  target: number,
  placement: "lastChild" | "before" | "after",
): Promise<void> {
  if (orca.state.blocks[target] === undefined) {
    const block = await invokeBackend("get-block", target);
    if (typeof block !== "object" || block === null || !("id" in block)) {
      throw new OrcaError(`get-block returned ${JSON.stringify(block)}`);
    }
    // The only write to this front-end cache (docs/ARCHITECTURE.md §4 移动块),
    // as Orca's own documentation does after a backend call.
    orca.state.blocks[target] = block as Block;
  }
  await invokeEditorCommand("core.editor.moveBlocks", [id], target, placement);
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
