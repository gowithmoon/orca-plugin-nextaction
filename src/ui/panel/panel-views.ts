// The views of the plugin panel (GLOSSARY: 视图), registered like the task
// menu's items. The navigation shows whatever is registered; later steps only
// append registrations.
import type { ComponentType } from "react";

/** One view of the plugin panel. */
export interface PanelView {
  /** Stable identifier, unique within the panel. */
  readonly id: string;
  /** Position in the navigation, lowest first. */
  readonly order: number;
  /** A tabler icon class, e.g. `"ti ti-inbox"`. */
  readonly icon: string;
  /** The name shown, already translated. */
  readonly label: () => string;
  /**
   * The number shown beside the name, e.g. tasks left to clarify. A React
   * hook: called on every render of the navigation item, so it may query and
   * subscribe. `undefined` shows no number.
   */
  readonly useCount?: () => number | undefined;
  /** The view's content. Panel details come from `usePanel`. */
  readonly component: ComponentType;
}

export interface PanelViews {
  /** Adds a view. Throws when its identifier is already registered. */
  register(view: PanelView): void;
  /** The registered views in navigation order. */
  list(): readonly PanelView[];
}

export function createPanelViews(): PanelViews {
  const views: PanelView[] = [];
  return {
    register(view) {
      if (views.some((existing) => existing.id === view.id)) {
        throw new Error(`Panel view "${view.id}" is already registered`);
      }
      views.push(view);
    },
    list: () => [...views].sort((a, b) => a.order - b.order),
  };
}
