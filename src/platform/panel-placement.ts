// Where the plugin panel opens and how it goes away (ADR 0011,
// editor-sidetool-panel "对后续步骤的影响"). Orca behaviour, verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
import type { ColumnPanel, RowPanel, ViewPanel } from "../orca.d.ts";
import type { NextActionPanelArgs } from "../ui/panel/nextaction-panel";

type AnyPanel = RowPanel | ColumnPanel | ViewPanel;
type Container = RowPanel | ColumnPanel;

/** Only these views have known `viewArgs`; any other is never covered. */
const coverableViews = new Set(["block", "journal"]);

export interface PanelPlacement {
  /**
   * Closes the plugin panel when one is open anywhere, otherwise opens it
   * from `originPanelId`. Throws when Orca does not open it.
   */
  toggle(originPanelId: string): void;
  /** Restores what the plugin panel covered, or closes it when it opened a new panel. */
  close(panelId: string): void;
}

/** The view panels showing `view`. Read before any navigation call: the tree is live. */
function findViewPanels(view: string): ViewPanel[] {
  const found: ViewPanel[] = [];
  const walk = (panel: AnyPanel) => {
    if ("children" in panel) panel.children.forEach(walk);
    else if (panel.view === view) found.push(panel);
  };
  walk(orca.state.panels);
  return found;
}

/** The container holding the panel `id`, if it is open. */
function parentOf(id: string): Container | undefined {
  const walk = (panel: AnyPanel): Container | undefined => {
    if (!("children" in panel)) return undefined;
    for (const child of panel.children) {
      if (child.id === id) return panel;
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  };
  return walk(orca.state.panels);
}

/**
 * The panel to cover: the right-hand neighbour in the origin's row, or the
 * left-hand one when the origin is rightmost. Only `block` and `journal`
 * views; `undefined` means open a new panel instead.
 */
function panelToCover(originPanelId: string): ViewPanel | undefined {
  const row = parentOf(originPanelId);
  if (row?.direction !== "row" || row.children.length < 2) return undefined;
  const index = row.children.findIndex((child) => child.id === originPanelId);
  const neighbour =
    index < row.children.length - 1
      ? row.children[index + 1]
      : row.children[index - 1];
  if (!neighbour || "children" in neighbour) return undefined;
  return coverableViews.has(neighbour.view) ? neighbour : undefined;
}

/**
 * The covered view's arguments with the types Orca needs: a wrong type
 * crashes the whole of Orca (editor-sidetool-panel, round 3). `undefined`
 * when they cannot be corrected.
 */
function correctedArgs(
  covered: NonNullable<NextActionPanelArgs["covered"]>,
): Record<string, unknown> | undefined {
  const args = { ...covered.viewArgs };
  if (covered.view === "journal") {
    const date =
      args.date instanceof Date
        ? args.date
        : typeof args.date === "string" || typeof args.date === "number"
          ? new Date(args.date)
          : undefined;
    if (!date || Number.isNaN(date.getTime())) return undefined;
    args.date = date;
  } else {
    const blockId = Number(args.blockId);
    if (!Number.isInteger(blockId)) return undefined;
    args.blockId = blockId;
  }
  return args;
}

/** Where the plugin panel of type `panelType` opens and how it closes. */
export function createPanelPlacement(panelType: string): PanelPlacement {
  const close = (panelId: string) => {
    const panel = orca.nav.findViewPanel(panelId, orca.state.panels);
    if (!panel || panel.view !== panelType) return;
    // Taken out before navigating: the panel object is live.
    const covered = (panel.viewArgs as Partial<NextActionPanelArgs>).covered;
    const args = covered && correctedArgs(covered);
    if (covered && args) orca.nav.replace(covered.view, args, panelId);
    else orca.nav.close(panelId);
  };

  const open = (originPanelId: string) => {
    const covered = panelToCover(originPanelId);
    if (covered) {
      // Shallow copies keep the original value types (no JSON round trip).
      const args: NextActionPanelArgs = {
        originPanelId,
        covered: {
          view: covered.view as "block" | "journal",
          viewArgs: { ...covered.viewArgs },
        },
      };
      // goTo, not replace: Orca's back button on that panel returns to it.
      orca.nav.goTo(panelType, { ...args }, covered.id);
      return;
    }

    const alone = parentOf(originPanelId)?.children.length === 1;
    const args: NextActionPanelArgs = { originPanelId };
    const panelId = orca.nav.addTo(originPanelId, "right", {
      view: panelType,
      viewArgs: { ...args },
      viewState: {},
    });
    if (!panelId) throw new Error("Orca did not open the panel");
    // The origin was alone in its row: split it in half. `changeSizes` gets
    // every width of the row, or the panels left out collapse to 0.
    const row = parentOf(panelId);
    if (alone && row?.direction === "row" && row.children.length === 2) {
      orca.nav.changeSizes(originPanelId, [0.5, 0.5]);
    }
  };

  return {
    toggle(originPanelId) {
      // At most one plugin panel: any open one closes, wherever it is.
      const openIds = findViewPanels(panelType).map((panel) => panel.id);
      if (openIds.length > 0) {
        for (const panelId of openIds) close(panelId);
        return;
      }
      open(originPanelId);
    },
    close,
  };
}
