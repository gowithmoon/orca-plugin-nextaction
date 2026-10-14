// The stats view's period switcher (#135): the scale's buttons as a
// segmented row, then paging and the period's title, wrapping in a narrow
// tier. Only Orca's theme variables; verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
export const statsPeriodCss = `
.nextaction-stats-period-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-sm) var(--orca-spacing-md);
  min-width: 0;
}

.nextaction-stats-scales {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 2px;
  margin: 0;
  padding: 2px;
  border: none;
  border-radius: var(--orca-radius-md);
  background-color: var(--orca-color-bg-2);
}

.nextaction-stats-scale {
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

.nextaction-stats-scale:hover {
  color: var(--orca-color-text-1);
}

.nextaction-stats-scale[aria-pressed="true"] {
  background-color: var(--orca-color-bg-1);
  color: var(--orca-color-text-1);
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-stats-scale:focus-visible {
  outline: 2px solid var(--orca-color-primary-5);
  outline-offset: -2px;
}

.nextaction-stats-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-xs);
  min-width: 0;
}

.nextaction-stats-pager > .nextaction-stats-period-title {
  margin: 0 var(--orca-spacing-xs);
  font-weight: var(--orca-fontweight-md);
  white-space: nowrap;
}
`;
