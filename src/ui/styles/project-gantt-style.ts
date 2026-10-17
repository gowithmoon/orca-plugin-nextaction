// Styles of the project details' gantt layout (#186), after the prototype
// chosen on 2026-10-17 (step11-project-gantt.html). Orca's CSS variables
// only. As the board, the view itself does not scroll: the attribute area
// and the toolbar stay at the top, the chart fills the rest and scrolls both
// ways on its own; its scale row sticks to the top, its tree column to the
// left, so the tree and the time axis scroll up and down together.

import { ganttRowHeight } from "../views/projects/gantt-axis";

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
  --nextaction-gantt-row: ${ganttRowHeight}px;
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

/* Coloured by status, as the status icons (#178). */
.nextaction-gantt-bar {
  position: absolute;
  top: 6px;
  height: 18px;
  z-index: 2;
  padding: 0;
  /* The status icon's colour, set on the bar (#178). */
  --nextaction-gantt-fill: color-mix(in srgb, var(--nextaction-gantt-status, var(--orca-color-text-2)) 28%, var(--orca-color-bg-1));
  --nextaction-gantt-edge: color-mix(in srgb, var(--nextaction-gantt-status, var(--orca-color-text-2)) 85%, transparent);
  border: 1px solid var(--nextaction-gantt-edge);
  border-radius: var(--orca-radius-sm);
  background-color: var(--nextaction-gantt-fill);
  cursor: pointer;
}

.nextaction-gantt-bar:hover {
  border-color: var(--orca-color-text-1);
}

/* Dragged to change its dates (#180): the middle moves it, an end resizes. */
.nextaction-gantt-bar {
  cursor: grab;
  touch-action: none;
}

.nextaction-gantt-bar[data-dragging] {
  z-index: 5;
}

.nextaction-gantt-bar-end {
  position: absolute;
  top: -2px;
  bottom: -2px;
  z-index: 4;
  cursor: ew-resize;
}

.nextaction-gantt-bar-end[data-side="start"] {
  left: -2px;
}

.nextaction-gantt-bar-end[data-side="due"] {
  right: -2px;
}

.nextaction-gantt-bar:hover .nextaction-gantt-bar-end::after,
.nextaction-gantt-bar[data-dragging] .nextaction-gantt-bar-end::after {
  content: "";
  position: absolute;
  top: 5px;
  bottom: 5px;
  left: 50%;
  border-left: 2px solid var(--nextaction-gantt-edge);
  border-radius: 1px;
}

:root[data-nextaction-gantt-dragging],
:root[data-nextaction-gantt-dragging] * {
  cursor: grabbing !important;
  user-select: none !important;
}

:root[data-nextaction-gantt-dragging="resize"],
:root[data-nextaction-gantt-dragging="resize"] * {
  cursor: ew-resize !important;
}

/* The dates a drag would write, just after the bar (#180). */
.nextaction-gantt-drag-dates {
  position: absolute;
  top: 5px;
  z-index: 6;
  padding: 0 7px;
  line-height: 20px;
  white-space: nowrap;
  border-radius: var(--orca-radius-sm);
  background-color: var(--orca-color-text-1);
  color: var(--orca-color-bg-1);
  font-size: var(--orca-fontsize-xs);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
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

/* A borrowed end (#177, scheme A): dashed on that side, fading toward it. */
.nextaction-gantt-bar[data-borrowed="start"],
.nextaction-gantt-bar[data-borrowed="due"] {
  --nextaction-gantt-faded: color-mix(in srgb, var(--nextaction-gantt-status, var(--orca-color-text-2)) 3%, var(--orca-color-bg-1));
  border-style: dashed;
}

.nextaction-gantt-bar[data-borrowed="start"] {
  border-right-style: solid;
  background: linear-gradient(to right, var(--nextaction-gantt-faded), var(--nextaction-gantt-fill) 75%);
}

.nextaction-gantt-bar[data-borrowed="due"] {
  border-left-style: solid;
  background: linear-gradient(to left, var(--nextaction-gantt-faded), var(--nextaction-gantt-fill) 75%);
}

/* A bracket over the subtasks' dates (#177): thin, never dragged. */
.nextaction-gantt-bracket {
  position: absolute;
  top: 11px;
  height: 7px;
  z-index: 2;
  border: 2px solid var(--orca-color-text-3);
  border-bottom: 0;
  border-radius: 3px 3px 0 0;
  cursor: default;
}

/* Done: faded; every one shows. */
.nextaction-gantt-bar[data-status="done"] {
  opacity: 0.45;
}

/* Someday: a light dashed frame. */
.nextaction-gantt-bar[data-status="someday"] {
  --nextaction-gantt-fill: color-mix(in srgb, var(--nextaction-gantt-status, var(--orca-color-text-2)) 10%, var(--orca-color-bg-1));
  border-style: dashed;
}

/* Overdue: the whole bar outlined in red. */
.nextaction-gantt-bar[data-overdue],
.nextaction-gantt-bar[data-overdue]:hover {
  border-color: var(--orca-color-dangerous-5);
  box-shadow: 0 0 0 1.5px var(--orca-color-dangerous-5);
}

/* Held back by an ancestor task's or the project's later start: hatched. */
.nextaction-gantt-held {
  position: absolute;
  top: -1px;
  bottom: -1px;
  margin-left: -1px;
  border-radius: 3px;
  background:
    repeating-linear-gradient(135deg, color-mix(in srgb, var(--orca-color-text-2) 60%, transparent) 0 1.4px, transparent 1.4px 5px),
    color-mix(in srgb, var(--orca-color-bg-1) 55%, transparent);
  pointer-events: none;
}

/* Blocked: a lock at the left end. */
.nextaction-gantt-lock {
  position: absolute;
  left: 1px;
  top: 1px;
  z-index: 1;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: var(--orca-color-bg-1);
  box-shadow: 0 0 0 1px var(--orca-color-border);
  color: var(--orca-color-text-2);
  font-size: 10px;
  pointer-events: none;
}

/*
 * The narrow tier's name, in the lane (#185): just after the bar, or, for a
 * row without one, held at the left edge of what shows.
 */
.nextaction-gantt-lane:has(> .nextaction-gantt-bar-name:not([data-beside])) {
  display: flex;
  align-items: center;
}

.nextaction-gantt-bar-name {
  max-width: 240px;
  height: var(--nextaction-gantt-row);
  padding: 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  background: none;
  color: var(--orca-color-text-2);
  font: inherit;
  font-size: var(--orca-fontsize-sm);
  text-align: left;
  cursor: pointer;
}

.nextaction-gantt-bar-name[data-beside] {
  position: absolute;
  top: 0;
  z-index: 3;
  padding: 0 2px;
}

.nextaction-gantt-bar-name:not([data-beside]) {
  position: sticky;
  left: 0;
}

.nextaction-gantt-bar-name:hover {
  color: var(--orca-color-text-1);
  text-decoration: underline;
  text-decoration-color: var(--orca-color-text-3);
}

.nextaction-gantt-bar-name[data-empty],
.nextaction-gantt-row[data-done] .nextaction-gantt-bar-name {
  color: var(--orca-color-text-3);
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

/* The unplaced tasks' section (#177), below the chart's scroller. */
.nextaction-gantt-unplaced {
  display: flex;
  flex-direction: column;
  max-height: 170px;
  margin: 0 calc(-1 * var(--orca-spacing-lg));
  border-top: 1px solid var(--orca-color-border);
  background-color: var(--orca-color-bg-2);
}

.nextaction-gantt-unplaced-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 0;
  border: 0;
  background: none;
  color: var(--orca-color-text-1);
  font: inherit;
  font-size: var(--orca-fontsize-sm);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.nextaction-gantt-unplaced-head > i {
  color: var(--orca-color-text-3);
  font-size: 12px;
}

.nextaction-gantt-unplaced-hint {
  margin: 0 14px 4px 32px;
  color: var(--orca-color-text-3);
  font-size: var(--orca-fontsize-xs);
}

.nextaction-gantt-unplaced-list {
  margin: 0;
  padding: 0 10px 8px 26px;
  overflow: auto;
  list-style: none;
}

.nextaction-gantt-unplaced-list > li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: var(--orca-radius-sm);
}

.nextaction-gantt-unplaced-list > li:hover,
.nextaction-gantt-unplaced-list > li[data-selected] {
  background-color: var(--orca-color-bg-3);
}

.nextaction-gantt-unplaced-list .nextaction-status-icon {
  flex: none;
}

/* An unplaced task dragged onto the time axis (#181). */
.nextaction-gantt-unplaced-list .nextaction-gantt-name-text {
  cursor: grab;
}

.nextaction-gantt-unplaced-list .nextaction-gantt-name-text[data-landing] {
  opacity: 0.5;
}

/* Where it would land: a week-long bar at the pointer's row. */
.nextaction-gantt-landing {
  position: absolute;
  z-index: 5;
  height: 18px;
  box-sizing: border-box;
  padding: 0 5px;
  overflow: hidden;
  border: 1px dashed var(--orca-color-primary-5);
  border-radius: var(--orca-radius-sm);
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 18%, var(--orca-color-bg-1));
  color: var(--orca-color-text-1);
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: none;
}
`;
