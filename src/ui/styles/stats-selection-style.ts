// The stats view's selection (#137): the chart's bar and the distribution's
// item selected, and the list below them, each card under a line saying
// whether it was done or skipped and when, as the review's look back does.
// Only Orca's theme variables, so both the light and the dark theme apply.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
export const statsSelectionCss = `
.nextaction-stats-bar-hit {
  cursor: pointer;
}

.nextaction-stats-bar-hit[aria-pressed="true"] {
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 14%, transparent);
  box-shadow: inset 0 -2px 0 var(--orca-color-primary-5);
}

/* The item is a button now: no button look, the row's grid kept. */
button.nextaction-stats-distribution-item {
  width: 100%;
  margin: 0;
  padding: 2px var(--orca-spacing-xs);
  border: none;
  border-radius: var(--orca-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--orca-fontsize-sm);
  text-align: left;
  cursor: pointer;
}

button.nextaction-stats-distribution-item:hover {
  background-color: color-mix(in srgb, var(--orca-color-text-1) 6%, transparent);
}

button.nextaction-stats-distribution-item[aria-pressed="true"] {
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 14%, transparent);
}

button.nextaction-stats-distribution-item:focus-visible {
  outline: 2px solid var(--orca-color-primary-5);
  outline-offset: -2px;
}

.nextaction-stats-selection-list > li {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nextaction-stats-entry-kind {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-xs);
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  font-variant-numeric: tabular-nums;
}

.nextaction-stats-entry-kind > .ti {
  color: var(--orca-color-text-green, var(--orca-color-primary-5));
}

.nextaction-stats-entry-kind[data-kind="skip"] > .ti {
  color: var(--orca-color-text-2);
}

.nextaction-stats-entry-when {
  margin-left: auto;
}
`;
