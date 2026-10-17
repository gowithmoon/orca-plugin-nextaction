// Styles of the project details' gantt layout (#186), after the prototype
// chosen on 2026-10-17 (step11-project-gantt.html). Orca's CSS variables
// only. As the board, the view itself does not scroll: the attribute area
// and the toolbar stay at the top, the chart fills the rest and scrolls both
// ways on its own; its scale row sticks to the top, its tree column to the
// left, so the tree and the time axis scroll up and down together.

export const projectGanttCss = `
.nextaction-panel-view:has(> .nextaction-project-details[data-layout="gantt"]) {
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
  padding-bottom: 0;
}

.nextaction-project-details[data-layout="gantt"] {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.nextaction-project-details[data-layout="gantt"] > * {
  flex: none;
}

.nextaction-gantt {
  --nextaction-gantt-row: 30px;
  --nextaction-gantt-head: 57px;
  flex: 1 1 auto !important;
  min-height: 0;
  overflow: auto;
  margin: 0 calc(-1 * var(--orca-spacing-lg));
  border-top: 1px solid var(--orca-color-border);
  background-color: var(--orca-color-bg-1);
}

.nextaction-gantt-body {
  position: relative;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.nextaction-gantt-head {
  position: sticky;
  top: 0;
  z-index: 6;
  display: flex;
  flex: none;
  height: var(--nextaction-gantt-head);
  background-color: var(--orca-color-bg-1);
  border-bottom: 1px solid var(--orca-color-border);
}

.nextaction-gantt-corner {
  position: sticky;
  left: 0;
  z-index: 7;
  flex: none;
  width: var(--nextaction-gantt-tree);
  display: flex;
  align-items: flex-end;
  padding: var(--orca-spacing-xs) var(--orca-spacing-md);
  background-color: var(--orca-color-bg-1);
  border-right: 1px solid var(--orca-color-border);
  color: var(--orca-color-text-3);
  font-size: var(--orca-fontsize-xs);
}

.nextaction-gantt-scale {
  position: relative;
  flex: none;
}

.nextaction-gantt-label {
  position: absolute;
  height: 20px;
  line-height: 20px;
  padding-left: 4px;
  overflow: hidden;
  white-space: nowrap;
  border-left: 1px solid var(--orca-color-border);
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
}

.nextaction-gantt-label[data-row="top"] {
  top: 0;
  color: var(--orca-color-text-1);
  font-weight: 600;
}

.nextaction-gantt-label[data-row="bottom"] {
  top: 20px;
}

/* The day scale (#179): one narrow label per day, its number centred. */
.nextaction-gantt-scale[data-scale="day"] .nextaction-gantt-label[data-row="bottom"] {
  padding-left: 0;
  text-align: center;
}

.nextaction-gantt-label[data-today] {
  color: var(--orca-color-primary-5);
  font-weight: 600;
}

.nextaction-gantt-marker {
  position: absolute;
  top: 40px;
  height: 15px;
  line-height: 13px;
  padding: 0 4px;
  transform: translateX(-50%);
  white-space: nowrap;
  border: 1px dashed var(--orca-color-text-3);
  border-radius: var(--orca-radius-sm);
  background-color: var(--orca-color-bg-1);
  color: var(--orca-color-text-2);
  font-size: 10px;
}

.nextaction-gantt-marker[data-today] {
  z-index: 1;
  border: 0;
  background-color: var(--orca-color-primary-5);
  color: var(--orca-color-bg-1);
}

.nextaction-gantt-rows {
  position: relative;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

.nextaction-gantt-lines {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 0;
  pointer-events: none;
}

.nextaction-gantt-lines > i {
  position: absolute;
  top: 0;
  bottom: 0;
}

.nextaction-gantt-grid {
  border-left: 1px solid color-mix(in srgb, var(--orca-color-border) 70%, transparent);
}

.nextaction-gantt-project-line {
  border-left: 1.5px dashed color-mix(in srgb, var(--orca-color-text-3) 70%, transparent);
}

.nextaction-gantt-today {
  width: 2px;
  margin-left: -1px;
  background-color: var(--orca-color-primary-5);
  opacity: 0.8;
}

.nextaction-gantt-row {
  display: flex;
  flex: none;
  height: var(--nextaction-gantt-row);
  border-bottom: 1px solid color-mix(in srgb, var(--orca-color-border) 50%, transparent);
}

.nextaction-gantt-row:hover .nextaction-gantt-lane,
.nextaction-gantt-row[data-selected] .nextaction-gantt-lane {
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 4%, transparent);
}

.nextaction-gantt-name {
  position: sticky;
  left: 0;
  z-index: 4;
  flex: none;
  width: var(--nextaction-gantt-tree);
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px 0 calc(4px + var(--nextaction-gantt-depth, 0) * 12px);
  background-color: var(--orca-color-bg-1);
  border-right: 1px solid var(--orca-color-border);
}

.nextaction-gantt-row:hover .nextaction-gantt-name,
.nextaction-gantt-row[data-selected] .nextaction-gantt-name {
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 4%, var(--orca-color-bg-1));
}

.nextaction-gantt-caret {
  flex: none;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--orca-radius-sm);
  background: none;
  color: var(--orca-color-text-3);
  font-size: 12px;
}

button.nextaction-gantt-caret {
  cursor: pointer;
}

button.nextaction-gantt-caret:hover {
  background-color: var(--orca-color-bg-3);
}

.nextaction-gantt-name .nextaction-status-icon {
  flex: none;
}

.nextaction-gantt-name-text {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  background: none;
  color: var(--orca-color-text-1);
  font: inherit;
  font-size: var(--orca-fontsize-sm);
  text-align: left;
  cursor: pointer;
}

.nextaction-gantt-name-text:hover {
  text-decoration: underline;
  text-decoration-color: var(--orca-color-text-3);
}

.nextaction-gantt-name-text[data-empty],
.nextaction-gantt-row[data-done] .nextaction-gantt-name-text {
  color: var(--orca-color-text-3);
}

.nextaction-gantt-lane {
  position: relative;
  flex: none;
}

/* One neutral colour for now; #178 colours bars by status. */
.nextaction-gantt-bar {
  position: absolute;
  top: 6px;
  height: 18px;
  z-index: 2;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--orca-color-text-2) 70%, transparent);
  border-radius: var(--orca-radius-sm);
  background-color: color-mix(in srgb, var(--orca-color-text-2) 22%, var(--orca-color-bg-1));
  cursor: pointer;
}

.nextaction-gantt-bar:hover {
  border-color: var(--orca-color-text-1);
}

/* The task's name by its bar (#179): inside when it fits, else after it. */
.nextaction-gantt-bar-label {
  position: absolute;
  top: 6px;
  z-index: 3;
  line-height: 18px;
  white-space: nowrap;
  pointer-events: none;
  color: var(--orca-color-text-2);
  font-size: 12px;
}

.nextaction-gantt-bar-label[data-inside] {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--orca-color-text-1);
}

/* Below the last row: the tree column carries on down, the lanes stay clear. */
.nextaction-gantt-fill {
  flex: 1 1 auto;
  min-height: var(--nextaction-gantt-row);
  position: sticky;
  left: 0;
  width: var(--nextaction-gantt-tree);
  border-right: 1px solid var(--orca-color-border);
  background-color: var(--orca-color-bg-1);
  z-index: 4;
}
`;
