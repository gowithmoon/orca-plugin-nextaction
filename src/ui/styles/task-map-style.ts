// Styles of the task map (#213): the view fills the panel and does not
// scroll, the canvas clipping a world that pans and zooms by transform; the
// project boxes, the no-project area and the parent tasks' boxes placed
// absolutely by the layout; fixed-width cards, their text up to two lines;
// the sequence and dependency arrows (#215) on an SVG layer above the
// cards, a card on a dependency cycle outlined red. Orca's CSS variables
// only, so both themes follow them.
import { cardWidth } from "../views/task-map/task-map-canvas";

export const taskMapCss = `
.nextaction-panel-view:has(> .nextaction-task-map) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 0;
}

.nextaction-task-map {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.nextaction-task-map > * {
  flex: none;
}

.nextaction-task-map-viewport {
  position: relative;
  flex: 1 1 auto !important;
  min-height: 0;
  overflow: hidden;
  margin: 0 calc(-1 * var(--orca-spacing-lg));
  border-top: 1px solid var(--orca-color-border);
  background-color: var(--orca-color-bg-1);
  outline: none;
  touch-action: none;
}

.nextaction-task-map-viewport:focus-visible {
  box-shadow: inset 0 0 0 2px var(--orca-color-primary-5);
}

.nextaction-task-map-world {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}

/* Where the cards are measured before the layout: out of sight, at size. */
.nextaction-task-map-measure {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}

.nextaction-task-map-card,
.nextaction-task-map-head {
  width: ${cardWidth}px;
  box-sizing: border-box;
}

.nextaction-task-map-world .nextaction-task-map-card,
.nextaction-task-map-box,
.nextaction-task-map-area {
  position: absolute;
  box-sizing: border-box;
}

.nextaction-task-map .nextaction-task-card {
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-md);
  background-color: var(--orca-color-bg-1);
}

.nextaction-task-map .nextaction-task-card-text {
  -webkit-line-clamp: 2;
}

/* A next action stands out: a primary bar on its left. */
.nextaction-task-map [data-next-action] > .nextaction-task-card {
  box-shadow: inset 3px 0 0 var(--orca-color-primary-5);
}

.nextaction-task-map-count {
  font-size: var(--orca-fontsize-xs);
  color: var(--orca-color-text-2);
}

.nextaction-task-map-area {
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-md);
  background-color: var(--orca-color-bg-2);
}

.nextaction-task-map-area[data-kind="noProject"] {
  border-style: dashed;
}

.nextaction-task-map-area-head {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  height: 32px;
  padding: 0 12px;
  min-width: 0;
  font-weight: 600;
  color: var(--orca-color-text-1);
}

.nextaction-task-map-area-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nextaction-task-map-area-name[data-empty] {
  color: var(--orca-color-text-3);
}

.nextaction-task-map-box {
  padding-top: 8px;
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-md);
  background-color: color-mix(in srgb, var(--orca-color-bg-1) 55%, var(--orca-color-bg-2));
}

.nextaction-task-map-head {
  margin-left: 12px;
}

.nextaction-task-map-edges {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
}

/* A card on a dependency cycle (#215): a danger outline. */
.nextaction-task-map [data-cycle] > .nextaction-task-card {
  border-color: var(--orca-color-dangerous-5);
  outline: 1px solid var(--orca-color-dangerous-5);
}

/*
 * The arrows (#215): a sequence thin and faint; a dependency firmer, dashed
 * in mode any; a date conflict the warning color, a cycle the danger one.
 * Each kind's arrowhead is its own marker, filled to match.
 */
.nextaction-task-map-arrow {
  fill: none;
  stroke: var(--orca-color-text-2);
  stroke-width: 1.6;
}

.nextaction-task-map-arrow[data-kind="sequence"] {
  stroke: var(--orca-color-text-3);
  stroke-width: 1;
  opacity: 0.6;
}

.nextaction-task-map-arrow[data-any] {
  stroke-dasharray: 6 4;
}

.nextaction-task-map-arrow[data-kind="conflict"] {
  stroke: var(--orca-color-warning-5, #d9a400);
}

.nextaction-task-map-arrow[data-kind="cycle"] {
  stroke: var(--orca-color-dangerous-5);
}

.nextaction-task-map-arrow-head {
  fill: var(--orca-color-text-2);
}

.nextaction-task-map-arrow-head[data-kind="sequence"] {
  fill: var(--orca-color-text-3);
  opacity: 0.6;
}

.nextaction-task-map-arrow-head[data-kind="conflict"] {
  fill: var(--orca-color-warning-5, #d9a400);
}

.nextaction-task-map-arrow-head[data-kind="cycle"] {
  fill: var(--orca-color-dangerous-5);
}

/*
 * The dependency badge (#220): just left of a dependent's card, where its
 * arrows come in; "Any" and "+N days" always shown, a quiet one only while
 * the pointer is on the card (or it has focus, or its popover is open).
 */
.nextaction-task-map-card,
.nextaction-task-map-head {
  position: relative;
}

.nextaction-task-map-badge {
  position: absolute;
  right: calc(100% + 6px);
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 4px;
  height: 16px;
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-sm);
  background-color: var(--orca-color-bg-1);
  color: var(--orca-color-text-2);
  font: inherit;
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  z-index: 1;
}

.nextaction-task-map-badge:hover,
.nextaction-task-map-badge[data-open] {
  color: var(--orca-color-text-1);
  border-color: var(--orca-color-primary-5);
}

.nextaction-task-map-badge:focus-visible {
  outline: var(--orca-border-box);
  outline-offset: 1px;
}

.nextaction-task-map-badge[data-quiet] {
  padding: 0 2px;
}

@media (hover: hover) {
  .nextaction-task-map-badge[data-quiet]:not([data-open], :focus-visible) {
    opacity: 0;
  }

  :is(.nextaction-task-map-card, .nextaction-task-map-head):hover
    > .nextaction-task-map-badge[data-quiet] {
    opacity: 1;
  }
}

/* The sequential switch on a box's head: the primary color while on. */
.nextaction-task-map-sequential[data-on] {
  color: var(--orca-color-primary-5);
  opacity: 1;
}

.nextaction-task-map-dependency-popover {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-sm);
  padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  min-width: 14em;
}

.nextaction-task-map-dependency-field {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
}

.nextaction-task-map-dependency-label {
  font-size: var(--orca-fontsize-sm);
  color: var(--orca-color-text-2);
}

.nextaction-task-map-dependency-popover .nextaction-delay-field > :first-child {
  flex: 0 0 5em;
}

/*
 * Dragging a card (#216): where it would go on the card or box under the
 * pointer. As a subtask, an outline; before or after it, a line in the gap
 * above or below it, or left or right of it in a sequential chain.
 */
[data-nextaction-map-drop][data-drop-over="lastChild"] {
  outline: 2px solid var(--orca-color-primary-5);
  outline-offset: 2px;
  border-radius: var(--orca-radius-md);
}

[data-nextaction-map-drop][data-drop-over="before"]::after,
[data-nextaction-map-drop][data-drop-over="after"]::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: -9px;
  height: 2px;
  border-radius: 1px;
  background-color: var(--orca-color-primary-5);
  pointer-events: none;
}

[data-nextaction-map-drop][data-drop-over="after"]::after {
  top: auto;
  bottom: -9px;
}

[data-nextaction-map-drop][data-in-sequence][data-drop-over="before"]::after,
[data-nextaction-map-drop][data-in-sequence][data-drop-over="after"]::after {
  top: 0;
  bottom: 0;
  left: -25px;
  right: auto;
  width: 2px;
  height: auto;
}

[data-nextaction-map-drop][data-in-sequence][data-drop-over="after"]::after {
  left: auto;
  right: -25px;
}

/* Over a project box's or the no-project area's empty space (#222). */
.nextaction-task-map-area[data-drop-over="area"] {
  outline: 2px dashed var(--orca-color-primary-5);
  outline-offset: 2px;
}

/* The window asking how to put a task in a project (area-drop.tsx). */
.nextaction-area-drop {
  --nextaction-window-width: 24rem;
}

.nextaction-area-drop-options {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-sm);
  padding: var(--orca-spacing-md) var(--orca-spacing-lg);
}

.nextaction-area-drop-option {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-md);
  background-color: var(--orca-color-bg-1);
  color: var(--orca-color-text-1);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.nextaction-area-drop-option:not(:disabled):hover,
.nextaction-area-drop-option:focus-visible {
  border-color: var(--orca-color-primary-5);
}

.nextaction-area-drop-option:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.nextaction-area-drop-option-label {
  font-weight: 600;
}

.nextaction-area-drop-option-detail {
  font-size: var(--orca-fontsize-sm);
  color: var(--orca-color-text-2);
}
`;
