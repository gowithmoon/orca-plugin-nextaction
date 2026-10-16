// Styles of the project details' board layout (#166), as the prototype
// chosen on 2026-10-16 (step11-project-board.html). Orca's CSS variables
// only. The board scrolls sideways on its own with scroll snapping
// (project-board spike B); the view itself does not scroll then: the
// attribute area and the toolbar stay at the top and every column scrolls
// up and down on its own. The tree layout still scrolls as a whole page.

export const projectBoardCss = `
.nextaction-panel-view:has(> .nextaction-project-details[data-layout="board"]) {
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
  padding-bottom: 0;
}

.nextaction-project-details[data-layout="board"] {
  container: nextaction-board / inline-size;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.nextaction-project-details[data-layout="board"] > * {
  flex: none;
}

.nextaction-layout-switch {
  flex: none;
}

.nextaction-layout-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.nextaction-board {
  flex: 1 1 auto !important;
  min-height: 0;
  display: flex;
  align-items: stretch;
  gap: var(--orca-spacing-md);
  overflow-x: auto;
  overflow-y: hidden;
  margin: 0 calc(-1 * var(--orca-spacing-lg));
  padding: 0 var(--orca-spacing-lg) var(--orca-spacing-md);
  scroll-snap-type: x proximity;
  scroll-padding-inline: var(--orca-spacing-lg);
}

/* About 260px; in a narrow view about 85% of its width, the next column's
   edge showing. */
.nextaction-board-column {
  flex: 0 0 min(260px, calc(100cqw * 0.85));
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: var(--orca-radius-md);
  background-color: color-mix(in srgb, var(--orca-color-bg-2) 70%, var(--orca-color-bg-1));
  scroll-snap-align: start;
}

.nextaction-board-column-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  min-height: 34px;
  padding: var(--orca-spacing-xs) var(--orca-spacing-md) var(--orca-spacing-xs) 10px;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  font-weight: 600;
}

.nextaction-board-column-title {
  color: var(--orca-color-text-1);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-board-column-count {
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.nextaction-board-column-spacer {
  flex: 1 1 auto;
}

.nextaction-board-column-button {
  flex: none;
}

.nextaction-board-column-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-sm);
  padding: 0 6px var(--orca-spacing-md);
}

.nextaction-board-card {
  flex: none;
  min-width: 0;
}

.nextaction-board-card > .nextaction-task-card {
  padding: 7px 9px;
  gap: 7px;
}

.nextaction-board-column-empty {
  padding: 14px var(--orca-spacing-md);
  border: 1px dashed var(--orca-color-border);
  border-radius: var(--orca-radius-md);
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  text-align: center;
}

.nextaction-board-earlier-toggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px 2px 2px;
  border: 0;
  border-radius: var(--orca-radius-sm);
  background: none;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  cursor: pointer;
}

.nextaction-board-earlier-toggle:hover {
  background-color: var(--orca-color-bg-3);
}

/* The done column collapsed: a narrow strip, opened by a click. */
.nextaction-board-strip {
  flex: 0 0 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--orca-spacing-sm);
  padding: 9px 0;
  border: 0;
  border-radius: var(--orca-radius-md);
  background-color: color-mix(in srgb, var(--orca-color-bg-2) 70%, var(--orca-color-bg-1));
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  cursor: pointer;
  scroll-snap-align: start;
}

.nextaction-board-strip:hover {
  color: var(--orca-color-text-1);
}

.nextaction-board-strip-label {
  writing-mode: vertical-rl;
  white-space: nowrap;
  font-weight: 600;
}
`;
