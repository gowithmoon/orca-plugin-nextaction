// Styles of the plugin's windows (#45 "两个弹窗共用的窗口外观"): the task
// panel popup and the quick capture window share one look, as CSS classes
// rather than a component. Injected through the registry. Orca's CSS
// variables only; class names start with `nextaction-`.
//
// `nextaction-window` goes on the element inside Orca's ModalOverlay: centred
// in the viewport, horizontally and vertically, without styling the overlay
// itself (its own layout is not documented). Orca's border, background and a
// soft shadow; never taller than the viewport. It lays its children out in a
// column; the one that may grow scrolls itself (`min-height: 0`).
// `--nextaction-window-width` sets a window's preferred width.
//
// `--orca-radius-md` and `--orca-shadow-popup` were measured in Orca
// (capture-initial-properties); `--orca-radius-lg` (8px) is in Orca 1.97's
// style sheet beside them.
//
// `nextaction-popup-layer` (ui/components/popup-layer.tsx) sits beside the
// window and covers the overlay, so the popups of its controls are laid out
// against the whole screen and drawn over the window, not cut off by it. It
// lets the pointer through to the window and the overlay; Orca's popups in it
// take the pointer themselves.

export const windowCss = `
.nextaction-window {
  position: fixed;
  inset: 0;
  margin: auto;
  height: fit-content;
  display: flex;
  flex-direction: column;
  width: min(
    var(--nextaction-window-width, 32rem),
    calc(100vw - 2 * var(--orca-spacing-lg))
  );
  max-height: calc(100vh - 2 * var(--orca-spacing-lg));
  border: 1px solid var(--orca-color-border);
  /* A step rounder than the cards inside (radius-md): the window is the outer shape. */
  border-radius: var(--orca-radius-lg);
  background-color: var(--orca-color-bg-1);
  box-shadow: var(--orca-shadow-popup);
  color: var(--orca-color-text-1);
  overflow: hidden;
}

.nextaction-window > * {
  min-height: 0;
}

.nextaction-popup-layer {
  position: absolute;
  inset: 0;
}

/*
 * No weight of its own: while a popup is open Orca makes its container catch
 * the pointer, so a click beside the popup closes the popup and nothing else
 * (orca-popup-container).
 */
:where(.nextaction-popup-layer) {
  pointer-events: none;
}

/* Focused only to take the keys from the editor behind it; not a control. */
.nextaction-window:focus {
  outline: none;
}
`;
