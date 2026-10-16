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
/* Dragging a card or a row (#168): no snapping while the board scrolls by
   itself near its edges; back on letting go. */
.nextaction-board[data-nextaction-board-dragging] {
  scroll-snap-type: none;
}

/* The column, or the done column's strip, a drop would change the status to. */
.nextaction-board-column[data-drop-over],
.nextaction-board-strip[data-drop-over] {
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 10%, var(--orca-color-bg-2));
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--orca-color-primary-5) 60%, transparent);
}

/* The card or subtask row a drop would make the task the last subtask of (#169). */
.nextaction-board-card[data-drop-over],
.nextaction-board-row[data-drop-over] {
  outline: 2px solid var(--orca-color-primary-5);
  outline-offset: 1px;
  border-radius: var(--orca-radius-md);
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 10%, transparent);
}

.nextaction-board-row[data-drop-over] {
  border-radius: var(--orca-radius-sm);
}

/* "As root task" (#170): a dashed drop at the right end, only while a task
   that is not a project root task is dragged. */
.nextaction-board-project-end {
  display: none;
  flex: 0 0 116px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: var(--orca-spacing-md);
  border: 1.5px dashed var(--orca-color-border);
  border-radius: var(--orca-radius-md);
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  text-align: center;
  scroll-snap-align: start;
}

.nextaction-board[data-nextaction-board-dragging-subtask] .nextaction-board-project-end {
  display: flex;
}

.nextaction-board-project-end[data-drop-over] {
  border-color: var(--orca-color-primary-5);
  color: var(--orca-color-primary-5);
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 8%, transparent);
}

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

/* By project root task (#171): a project root task's column, or "Other",
   or a finished column's strip, a drop would make the task a subtask of, or
   a project root task. */
.nextaction-board-column[data-nextaction-board-drop-root][data-drop-over],
.nextaction-board-strip[data-nextaction-board-drop-root][data-drop-over],
.nextaction-board-column[data-nextaction-board-drop-other][data-drop-over] {
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 10%, var(--orca-color-bg-2));
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--orca-color-primary-5) 60%, transparent);
}

/* An empty "Other" shows only while dragging. */
.nextaction-board-column[data-nextaction-board-drop-other][data-empty] {
  display: none;
}

.nextaction-board[data-nextaction-board-dragging] .nextaction-board-column[data-nextaction-board-drop-other][data-empty] {
  display: flex;
}

/* The column head's project root task name: opens its task panel. */
.nextaction-board-root-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0;
  border: 0;
  background: none;
  color: var(--orca-color-text-1);
  font: inherit;
  font-size: var(--orca-fontsize-sm);
  text-align: left;
  cursor: pointer;
}

.nextaction-board-root-name:hover {
  text-decoration: underline;
}

.nextaction-board-root-name[data-empty] {
  color: var(--orca-color-text-2);
  font-style: italic;
}

.nextaction-board-root-name:focus-visible {
  outline: var(--orca-border-box);
  outline-offset: 1px;
}

/* "Done N" at a column's bottom, its done cards faded. */
.nextaction-board-done {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-sm);
}

.nextaction-board-done > .nextaction-board-card {
  opacity: 0.6;
}

.nextaction-board-strip-label {
  max-height: 16em;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* A next action (#167): a small dot at the status icon's top right. */
.nextaction-task-card-status-button,
.nextaction-task-card-status-mark {
  position: relative;
}

.nextaction-next-action-dot {
  position: absolute;
  top: 1px;
  right: -3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: var(--orca-color-primary-5);
  box-shadow: 0 0 0 1.5px var(--orca-color-bg-1);
  pointer-events: none;
}

/* A card's subtasks (#167): the count and its toggle, then the rows. */
.nextaction-board-subtasks {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px var(--orca-spacing-md);
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  line-height: var(--orca-lineheight-sm);
}

.nextaction-board-subtasks-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 20px;
  margin-left: -4px;
  padding: 0 5px 0 2px;
  border: 0;
  border-radius: var(--orca-radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.nextaction-board-subtasks-toggle:hover {
  background-color: var(--orca-color-bg-3);
  color: var(--orca-color-text-1);
}

.nextaction-board-subtasks-toggle:focus-visible {
  outline: var(--orca-border-box);
  outline-offset: 1px;
}

.nextaction-board-subtasks-count,
.nextaction-board-subtasks-summary {
  font-variant-numeric: tabular-nums;
}

.nextaction-board-rows {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0 0 0 -4px;
  padding: 0;
  list-style: none;
}

.nextaction-board-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 1px 4px 1px calc(4px + var(--nextaction-row-depth, 0) * 14px);
  border-radius: var(--orca-radius-sm);
  font-size: var(--orca-fontsize-xs);
  cursor: pointer;
}

.nextaction-board-row:hover {
  background-color: var(--orca-color-bg-2);
}

.nextaction-board-row[data-selected] {
  background-color: var(--orca-color-bg-3);
}

.nextaction-board-row:focus-visible {
  outline: var(--orca-border-box);
  outline-offset: -1px;
}

.nextaction-board-row[data-done] > * {
  opacity: 0.6;
}

.nextaction-board-row .nextaction-task-card-status-button {
  height: 18px;
}

.nextaction-board-row .nextaction-status-icon {
  font-size: var(--orca-fontsize-sm);
}

.nextaction-board-row-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--orca-color-text-1);
}

.nextaction-board-row-text[data-empty] {
  color: var(--orca-color-text-2);
  font-style: italic;
}

.nextaction-board-row-lock {
  flex: none;
  display: inline-flex;
  color: var(--orca-color-dangerous-5);
}
`;
