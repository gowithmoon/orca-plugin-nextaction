// Styles of the plugin's windows (#45 "两个弹窗共用的窗口外观", #118): every
// window (ui/components/plugin-window.tsx) shares one look, and the standard
// header and footer. Injected through the registry. Orca's CSS variables
// only; class names start with `nextaction-`.
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

/* The standard header (plugin-window.tsx): title, the task's text, close. */
.nextaction-window-header {
  display: flex;
  align-items: flex-start;
  gap: var(--orca-spacing-sm);
  flex: 0 0 auto;
  padding: var(--orca-spacing-md) var(--orca-spacing-md) 0 var(--orca-spacing-lg);
}

/* A title alone sits level with the close button. */
.nextaction-window-header[data-title-only] {
  align-items: center;
}

.nextaction-window-heading {
  display: flex;
  flex-direction: column;
  gap: calc(var(--orca-spacing-xs) / 2);
  flex: 1 1 auto;
  min-width: 0;
}

.nextaction-window-title {
  font-size: var(--orca-fontsize-md);
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-window-task {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-window-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-sm);
  flex: 0 0 auto;
  padding: var(--orca-spacing-md) var(--orca-spacing-lg);
  border-top: var(--orca-border-separator);
  background-color: var(--orca-color-bg-2);
}

.nextaction-window-spacer {
  flex: 1 1 auto;
}
`;
