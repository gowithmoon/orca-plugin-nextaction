// "Open in notes" (#35 "在笔记中打开"): shows a task's block in a note panel,
// never in the plugin panel itself. Shared by the task card and the task
// panel. Orca behaviour, verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { NextActionPanelArgs } from "../ui/panel/nextaction-panel";
import type { OpenInNotes } from "../ui/panel/open-in-notes";
import { findViewPanels } from "./panel-tree";

/** "Open in notes" for the plugin panel of type `panelType`. */
export function createOpenInNotes(panelType: string): OpenInNotes {
  const viewPanel = (id: string | undefined) =>
    id === undefined
      ? undefined
      : (orca.nav.findViewPanel(id, orca.state.panels) ?? undefined);

  /**
   * The plugin panel asking: the one given, else the active panel when it is
   * the plugin panel (e.g. a popup opened from a card has no panel of its own).
   */
  const askingPluginPanel = (from: Parameters<OpenInNotes>[1]) => {
    if (from) return from;
    const active = viewPanel(orca.state.activePanel);
    if (active?.view !== panelType) return undefined;
    const args = active.viewArgs as Partial<NextActionPanelArgs>;
    return { panelId: active.id, originPanelId: args.originPanelId };
  };

  /**
   * An open journal or block panel: the most recently active one, else the
   * first in the layout.
   */
  const openNotePanel = (): string | undefined => {
    const open = new Set(
      [...findViewPanels("journal"), ...findViewPanels("block")].map(
        (panel) => panel.id,
      ),
    );
    const history = orca.state.panelBackHistory;
    for (let i = history.length - 1; i >= 0; i--) {
      const id = history[i]?.activePanel;
      if (id !== undefined && open.has(id)) return id;
    }
    return open.values().next().value;
  };

  return (blockId, from) => {
    const plugin = askingPluginPanel(from);
    if (!plugin) {
      // Not from the plugin panel (e.g. Orca's own menus): the active panel.
      orca.nav.goTo("block", { blockId }, orca.state.activePanel);
      return;
    }
    // The panel that opened the plugin panel, never the covered one. It may
    // show something else by now; it is still the user's note panel.
    const origin = viewPanel(plugin.originPanelId);
    if (origin && origin.view !== panelType) {
      orca.nav.goTo("block", { blockId }, origin.id);
      return;
    }
    // The origin was closed: another note panel, if one is open (e.g. the
    // one opened here last time), so each task does not open a panel of its
    // own; else a new panel left of the plugin panel.
    const other = openNotePanel();
    if (other) {
      orca.nav.goTo("block", { blockId }, other);
      return;
    }
    const opened = orca.nav.addTo(plugin.panelId, "left", {
      view: "block",
      viewArgs: { blockId },
      viewState: {},
    });
    if (!opened) throw new Error("Orca did not open a panel");
  };
}
