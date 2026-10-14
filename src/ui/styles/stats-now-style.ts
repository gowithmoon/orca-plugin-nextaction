// The stats view's header numbers (#134): two rows of two in the narrow
// tier, one row of four in the medium and wide tiers. Each number is a
// button. Only Orca's theme variables, so both the light and the dark theme
// apply. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
export const statsNowCss = `
.nextaction-stats-now {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--orca-spacing-sm);
  margin: 0 0 var(--orca-spacing-md);
  padding: 0;
  list-style: none;
}

.nextaction-stats-now-narrow {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.nextaction-stats-now-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--orca-spacing-xs);
  width: 100%;
  margin: 0;
  padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.nextaction-stats-now-item:hover {
  background-color: color-mix(in srgb, var(--orca-color-text-1) 6%, transparent);
}

.nextaction-stats-now-item:focus-visible {
  outline: 2px solid var(--orca-color-primary-5);
  outline-offset: 1px;
}

.nextaction-stats-now-count {
  color: var(--orca-color-text-1);
  font-size: var(--orca-fontsize-lg);
  font-weight: var(--orca-fontweight-lg);
  font-variant-numeric: tabular-nums;
}

.nextaction-stats-now-label {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-xs);
  min-width: 0;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;
