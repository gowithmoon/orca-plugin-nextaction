// Styles of the gantt chart's shift later notice (#184), after the prototype
// chosen on 2026-10-17 (step11-project-gantt.html): a strip above the chart,
// tinted with the date conflict's red. Orca's CSS variables only.

export const ganttShiftLaterCss = `
.nextaction-gantt-shift-notice {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 calc(-1 * var(--orca-spacing-lg));
  padding: 6px var(--orca-spacing-lg);
  border-top: 1px solid var(--orca-color-border);
  background-color: color-mix(
    in srgb,
    var(--orca-color-dangerous-5) 9%,
    var(--orca-color-bg-1)
  );
  color: var(--orca-color-text-1);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-gantt-shift-notice > .ti {
  color: var(--orca-color-dangerous-5);
}

.nextaction-gantt-shift-notice-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;
