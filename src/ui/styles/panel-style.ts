// The plugin panel's style sheet, injected through the registry. Orca's CSS
// variables only; class names start with `nextaction-`.
import { panelTierWidths, sidePaneWidth } from "../panel/tiers";

export const panelCss = `
.nextaction-panel {
  /* The tier thresholds, for reference; the shell picks the tier in code. */
  --nextaction-tier-medium: ${panelTierWidths.medium}px;
  --nextaction-tier-wide: ${panelTierWidths.wide}px;
  --nextaction-side-min: ${sidePaneWidth.min}px;
  --nextaction-side-max: ${sidePaneWidth.max}px;
  --nextaction-side-ratio: ${sidePaneWidth.ratio * 100}%;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;
  background-color: var(--orca-color-bg-1);
  color: var(--orca-color-text-1);
  font-family: var(--orca-fontfamily-ui);
  font-size: var(--orca-fontsize-sm);
  /* Orca panels do not let text be selected (editor-sidetool-panel). */
  user-select: text;
}

.nextaction-panel *,
.nextaction-panel *::before,
.nextaction-panel *::after {
  box-sizing: border-box;
}

.nextaction-panel-header {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  flex: 0 0 auto;
  min-height: var(--orca-height-headbar);
  padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  border-bottom: var(--orca-border-separator);
  user-select: none;
}

.nextaction-panel-nav {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-xs);
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.nextaction-panel-nav-item {
  display: inline-flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  flex: 0 1 auto;
  min-width: 0;
  height: var(--orca-height-segmented);
  padding: 0 var(--orca-spacing-md);
  border: none;
  border-radius: var(--orca-radius-sm);
  background: transparent;
  color: var(--orca-color-text-2);
  font: inherit;
  font-weight: var(--orca-fontweight-lg);
  cursor: pointer;
}

.nextaction-panel-nav-item:hover {
  background-color: var(--orca-color-bg-2);
  color: var(--orca-color-text-1);
}

.nextaction-panel-nav-item[aria-selected="true"] {
  background-color: var(--orca-color-bg-2);
  color: var(--orca-color-text-1);
}

.nextaction-panel-nav-item:focus-visible {
  outline: var(--orca-border-box);
  outline-offset: 1px;
}

.nextaction-panel-nav-item > .ti {
  flex: 0 0 auto;
  font-size: var(--orca-fontsize-md);
}

.nextaction-panel-nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nextaction-panel-nav-count {
  flex: 0 0 auto;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  font-variant-numeric: tabular-nums;
}

/* Narrow: icons only, except the current view. */
.nextaction-panel[data-tier="narrow"]
  .nextaction-panel-nav-item:not([aria-selected="true"])
  :is(.nextaction-panel-nav-label, .nextaction-panel-nav-count) {
  display: none;
}

.nextaction-panel-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.nextaction-panel-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.nextaction-panel-view {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: var(--orca-spacing-md) var(--orca-spacing-lg);
}

.nextaction-panel-side {
  /* The task panel fills it; its own body scrolls. */
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  width: clamp(
    var(--nextaction-side-min),
    var(--nextaction-side-ratio),
    var(--nextaction-side-max)
  );
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  border-left: var(--orca-border-separator);
  background-color: var(--orca-color-bg-1);
}

.nextaction-view-header {
  display: flex;
  align-items: baseline;
  gap: var(--orca-spacing-sm);
  min-width: 0;
  margin-bottom: var(--orca-spacing-md);
}

.nextaction-view-title {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--orca-fontsize-lg);
  font-weight: var(--orca-fontweight-xl);
  line-height: var(--orca-lineheight-sm);
}

.nextaction-view-count {
  flex: 0 0 auto;
  color: var(--orca-color-text-2);
  font-variant-numeric: tabular-nums;
}
`;
