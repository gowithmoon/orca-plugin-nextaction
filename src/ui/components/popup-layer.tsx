// Where the plugin's windows and the plugin panel put the popups of their
// controls (the date picker, the context and label menus). Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
//
// Orca's popups go into `menuContainer` (`container`), or else into their
// anchor's `offsetParent`, and lay themselves out within it
// (orca-popup-container). Inside a window that is the window itself; inside
// the plugin panel it is the panel's `.orca-hideable`, which clips them at
// the panel's edges: a menu and its submenu do not fit in a narrow panel. A
// layer covers the viewport instead, and lets the pointer through until
// Orca's popup takes it while open (window-style.ts, panel-style.ts).
import * as React from "react";
import { createPortal } from "react-dom";

const PopupLayerContext = React.createContext<
  React.RefObject<HTMLElement> | undefined
>(undefined);

/**
 * The layer for the popups of the controls inside: the window's, or the
 * plugin panel's. `undefined` elsewhere, where Orca's own placement is kept.
 */
export function usePopupLayer(): React.RefObject<HTMLElement> | undefined {
  return React.useContext(PopupLayerContext);
}

/** Renders `children` (a window) and, over them, the layer for their popups. */
export function PopupLayer(props: { children: React.ReactNode }) {
  const layer = React.useRef<HTMLDivElement>(null);
  return (
    <PopupLayerContext.Provider value={layer}>
      {props.children}
      <div ref={layer} className="nextaction-popup-layer" />
    </PopupLayerContext.Provider>
  );
}

/**
 * The plugin panel's layer, under `document.body`. Inside the panel it would
 * cover the viewport but stack with the panel: every panel's `.orca-hideable`
 * is `z-index: 10`, so a panel after it in the row would cover the menu
 * reaching into it (orca-popup-container, round 2).
 */
export function PanelPopupLayer(props: { children: React.ReactNode }) {
  const layer = React.useRef<HTMLDivElement>(null);
  return (
    <PopupLayerContext.Provider value={layer}>
      {props.children}
      {createPortal(
        <div ref={layer} className="nextaction-panel-popup-layer" />,
        document.body,
      )}
    </PopupLayerContext.Provider>
  );
}
