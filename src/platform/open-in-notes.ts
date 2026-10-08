// "Open in notes" (#35 "在笔记中打开"): shows a task's block in a note panel,
// never in the plugin panel itself. Shared by the task card and the task
// panel. Orca behaviour, verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { NextActionPanelArgs } from "../ui/panel/nextaction-panel";
import type { OpenInNotes } from "../ui/panel/open-in-notes";

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
    // The origin was closed: a new panel left of the plugin panel.
    const opened = orca.nav.addTo(plugin.panelId, "left", {
      view: "block",
      viewArgs: { blockId },
      viewState: {},
    });
    if (!opened) throw new Error("Orca did not open a panel");
  };
}
