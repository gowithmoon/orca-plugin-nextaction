// Reading Orca's panel tree (`orca.state.panels`). The tree is live: read
// what is needed before any navigation call changes it (editor-sidetool-panel).
import type { ColumnPanel, RowPanel, ViewPanel } from "../orca.d.ts";

export type AnyPanel = RowPanel | ColumnPanel | ViewPanel;
export type ContainerPanel = RowPanel | ColumnPanel;

/** The open view panels showing `view`. */
export function findViewPanels(view: string): ViewPanel[] {
  const found: ViewPanel[] = [];
  const walk = (panel: AnyPanel) => {
    if ("children" in panel) panel.children.forEach(walk);
    else if (panel.view === view) found.push(panel);
  };
  walk(orca.state.panels);
  return found;
}

/** The container holding the panel `id`, if it is open. */
export function parentOf(id: string): ContainerPanel | undefined {
  const walk = (panel: AnyPanel): ContainerPanel | undefined => {
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
