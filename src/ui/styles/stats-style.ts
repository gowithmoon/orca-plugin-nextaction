// The stats view (#132): the period's title and totals, the completion
// chart and its legend. Top to bottom in every tier; the chart fills the
// width. Only Orca's theme variables, so both the light and the dark theme
// apply; the skips are the completions' colour at half strength. Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
export const statsCss = `
.nextaction-stats-period {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
  min-width: 0;
}

.nextaction-stats-period-title {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-stats-totals {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orca-spacing-lg);
  margin: 0;
  padding: 0;
  list-style: none;
}

.nextaction-stats-totals > li {
  display: flex;
  align-items: baseline;
  gap: var(--orca-spacing-xs);
}

.nextaction-stats-total-count {
  color: var(--orca-color-text-1);
  font-size: var(--orca-fontsize-lg);
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-stats-total-label {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-stats-chart {
  position: relative;
  width: 100%;
  min-width: 0;
  min-height: 168px;
}

.nextaction-stats-chart > svg {
  display: block;
}

.nextaction-stats-grid {
  stroke: var(--orca-color-border);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}

.nextaction-stats-baseline {
  stroke: var(--orca-color-text-2);
  stroke-width: 1;
}

.nextaction-stats-axis-text {
  fill: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
}

.nextaction-stats-axis-today {
  fill: var(--orca-color-text-1);
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-stats-bar-completions {
  fill: var(--orca-color-primary-5);
}

.nextaction-stats-bar-skips {
  fill: oklch(from var(--orca-color-primary-5) l c h / 40%);
}

/* Buttons over the bars: focus, tooltip and label; the SVG only draws. */
.nextaction-stats-bars {
  position: absolute;
  right: 4px;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.nextaction-stats-bar-hit {
  position: absolute;
  top: 0;
  bottom: 0;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: var(--orca-radius-sm);
  background: transparent;
  cursor: default;
}

.nextaction-stats-bar-hit:hover {
  background-color: oklch(from var(--orca-color-text-1) l c h / 8%);
}

.nextaction-stats-bar-hit:focus-visible {
  outline: 2px solid var(--orca-color-primary-5);
  outline-offset: -2px;
}

.nextaction-stats-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orca-spacing-md);
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
}

.nextaction-stats-legend > span::before {
  content: "";
  display: inline-block;
  width: 0.75em;
  height: 0.75em;
  margin-right: var(--orca-spacing-xs);
  border-radius: 2px;
  vertical-align: -0.05em;
}

.nextaction-stats-legend-completions::before {
  background-color: var(--orca-color-primary-5);
}

.nextaction-stats-legend-skips::before {
  background-color: oklch(from var(--orca-color-primary-5) l c h / 40%);
}

.nextaction-stats-empty {
  margin: 0;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
  text-align: center;
}
`;
