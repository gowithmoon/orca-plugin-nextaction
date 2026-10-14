// The stats view's distribution of completions (#136): a title with the
// segmented control beside it (wrapping under it when narrow), then a row
// per item: its name, its bar filling the rest, its count. Top to bottom in
// every tier. Only Orca's theme variables, so both the light and the dark
// theme apply; the bars share the completion chart's colour
// (`nextaction-stats-bar-completions`). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
export const statsDistributionCss = `
.nextaction-stats-distribution {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-sm);
  min-width: 0;
}

.nextaction-stats-distribution-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--orca-spacing-sm);
}

.nextaction-stats-distribution-title {
  margin: 0;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-stats-segmented {
  display: inline-flex;
  gap: 2px;
  min-inline-size: 0;
  margin: 0;
  padding: 2px;
  border: none;
  border-radius: var(--orca-radius-md);
  background-color: var(--orca-color-bg-2);
}

.nextaction-stats-segment {
  height: calc(var(--orca-height-segmented) - 4px);
  padding: 0 var(--orca-spacing-md);
  border: none;
  border-radius: var(--orca-radius-sm);
  background: transparent;
  color: var(--orca-color-text-2);
  font: inherit;
  font-size: var(--orca-fontsize-sm);
  cursor: pointer;
}

.nextaction-stats-segment:hover {
  color: var(--orca-color-text-1);
}

.nextaction-stats-segment[aria-pressed="true"] {
  background-color: var(--orca-color-bg-1);
  color: var(--orca-color-text-1);
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-stats-segment:focus-visible {
  outline: 2px solid var(--orca-color-primary-5);
  outline-offset: -2px;
}

.nextaction-stats-distribution-items {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Name, bar, count: the names share a column up to a third of the width. */
.nextaction-stats-distribution-item {
  display: grid;
  grid-template-columns: minmax(4em, min(9em, 33%)) minmax(0, 1fr) 2.5em;
  align-items: center;
  gap: var(--orca-spacing-sm);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-stats-distribution-name {
  overflow: hidden;
  color: var(--orca-color-text-1);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nextaction-stats-distribution-item[data-not-set]
  .nextaction-stats-distribution-name {
  color: var(--orca-color-text-2);
  font-style: italic;
}

.nextaction-stats-distribution-track {
  display: block;
  border-radius: 2px;
  background-color: color-mix(in srgb, var(--orca-color-text-1) 6%, transparent);
}

.nextaction-stats-distribution-count {
  color: var(--orca-color-text-2);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
`;
