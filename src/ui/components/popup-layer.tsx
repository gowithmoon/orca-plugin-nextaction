// Where the plugin's windows put the popups of their controls (the date
// picker, the context and label menus). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
//
// Orca's popups go into `menuContainer`, or else into their anchor's
// `offsetParent`: inside a window that is the window itself, which clips them
// and lays them out within its own small box (orca-popup-container). The layer
// covers the viewport instead, and lets the pointer through until Orca's popup
// takes it while open (window-style.ts).
import * as React from "react";

const PopupLayerContext = React.createContext<
  React.RefObject<HTMLElement> | undefined
>(undefined);

/**
 * The layer for the popups of the controls inside; `undefined` outside a
 * window (e.g. the side pane), where Orca's own placement works.
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
