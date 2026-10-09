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
// Neither `--orca-radius-md` nor an Orca shadow variable shows up in the
// plugin docs or `orca.d.ts`, so both fall back to what is known to exist.

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
  border-radius: var(--orca-radius-md, var(--orca-radius-sm));
  background-color: var(--orca-color-bg-1);
  box-shadow: var(--orca-shadow-popup, 0 8px 24px rgb(0 0 0 / 0.16));
  color: var(--orca-color-text-1);
  overflow: hidden;
}

.nextaction-window > * {
  min-height: 0;
}

/* Focused only to take the keys from the editor behind it; not a control. */
.nextaction-window:focus {
  outline: none;
}
`;
