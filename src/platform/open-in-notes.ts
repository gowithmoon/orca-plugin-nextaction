// Opens a task's block in the notes (#35 "在笔记中打开"), for the task panel's
// button. Kept minimal and in one file: #39 builds the card's version, and
// the two are unified when they meet. Orca behaviour, verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import type { ColumnPanel, RowPanel, ViewPanel } from "../orca.d.ts";

type AnyPanel = RowPanel | ColumnPanel | ViewPanel;

/** The first open view panel showing `view`. Read before navigating: the tree is live. */
function findView(view: string): ViewPanel | undefined {
  const walk = (panel: AnyPanel): ViewPanel | undefined => {
    if (!("children" in panel)) return panel.view === view ? panel : undefined;
    for (const child of panel.children) {
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  };
  return walk(orca.state.panels);
}

/**
 * Opens block `blockId` with `goTo` (Orca's back button returns): in
 * `originPanelId` when it is still open (the panel the plugin panel was
 * opened from, never the covered one), otherwise in the active panel. Never
 * in the plugin panel (type `panelType`): when that is the only candidate, a
 * new panel opens to its left.
 */
export function createOpenInNotes(
  panelType: string,
): (blockId: number, originPanelId?: string) => void {
  const usable = (id: string | undefined) => {
    if (id === undefined) return undefined;
    const panel = orca.nav.findViewPanel(id, orca.state.panels);
    return panel && panel.view !== panelType ? panel : undefined;
  };

  return (blockId, originPanelId) => {
    // `blockId` stays a number: a wrong type crashes Orca (editor-sidetool-panel).
    const args = { blockId };
    const target = usable(originPanelId) ?? usable(orca.state.activePanel);
    if (target) {
      orca.nav.goTo("block", args, target.id);
      return;
    }
    const plugin = findView(panelType);
    if (!plugin) {
      orca.nav.goTo("block", args);
      return;
    }
    const opened = orca.nav.addTo(plugin.id, "left", {
      view: "block",
      viewArgs: args,
      viewState: {},
    });
    if (!opened) throw new Error("Orca did not open a panel for the block");
  };
}
