// The plugin's type scale, injected through the registry: Orca's font sizes
// times one factor on every root the plugin draws in (the plugin panel, the
// windows, the panel's popup layer under `document.body`). Orca's own font
// size variables are redefined there, as Orca does for its block previews,
// so the plugin's text and the Orca components inside it (buttons, selects,
// inputs, menus) shrink together and every size keeps its place (orca-fontsize).
//
// `:root` keeps Orca's sizes under the plugin's names first: a variable cannot
// be computed from itself, and these resolve at `:root`, so a root nested in
// another is not scaled twice.

const sizes = ["xs", "sm", "md", "lg", "xl"] as const;

export const typeScaleCss = `
:root {
${sizes.map((size) => `  --nextaction-orca-fontsize-${size}: var(--orca-fontsize-${size});`).join("\n")}
}

.nextaction-panel,
.nextaction-window,
.nextaction-panel-popup-layer {
  /* The one knob: 1 is Orca's own sizes. */
  --nextaction-font-scale: 0.9;
${sizes.map((size) => `  --orca-fontsize-${size}: calc(var(--nextaction-orca-fontsize-${size}) * var(--nextaction-font-scale));`).join("\n")}
}

/*
 * The toolbars' fields, a size down from the cards' text: they are how the
 * list is narrowed, not what it shows. Orca's buttons and selects take
 * \`sm\`, so it is given the \`xs\` size here.
 */
:is(.nextaction-toolbar, .nextaction-filter-panel, .nextaction-my-day-search) {
  --orca-fontsize-sm: var(--orca-fontsize-xs);
  font-size: var(--orca-fontsize-xs);
}
`;
