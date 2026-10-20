// Styles of the task map (#213): the view fills the panel and does not
// scroll, the canvas clipping a world that pans and zooms by transform; the
// project boxes, the no-project area and the parent tasks' boxes placed
// absolutely by the layout; fixed-width cards, their text up to two lines;
// the sequence arrows on an SVG layer above the cards. Orca's CSS variables
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

.nextaction-task-map-sequence {
  fill: none;
  stroke: var(--orca-color-text-3);
  stroke-width: 1.2;
}

.nextaction-task-map-arrow-head {
  fill: var(--orca-color-text-3);
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
`;
