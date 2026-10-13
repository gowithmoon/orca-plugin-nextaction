// The plugin's type scale, injected through the registry: Orca's font sizes
// times one factor, so the plugin's text sits a little smaller than Orca's
// while every size keeps its place in the hierarchy. The other style sheets
// use `--nextaction-fontsize-*` rather than `--orca-fontsize-*`.
//
// Declared on every root the plugin draws in: the plugin panel, the windows,
// and the panel's popup layer under `document.body`. `xs` is left at Orca's
// size: the counts, dates and hints set in it would be hard to read smaller.

export const typeScaleCss = `
.nextaction-panel,
.nextaction-window,
.nextaction-panel-popup-layer {
  /* The one knob: 1 is Orca's own sizes. */
  --nextaction-font-scale: 0.9;
  --nextaction-fontsize-xs: var(--orca-fontsize-xs);
  --nextaction-fontsize-sm: calc(var(--orca-fontsize-sm) * var(--nextaction-font-scale));
  --nextaction-fontsize-md: calc(var(--orca-fontsize-md) * var(--nextaction-font-scale));
  --nextaction-fontsize-lg: calc(var(--orca-fontsize-lg) * var(--nextaction-font-scale));
}
`;
