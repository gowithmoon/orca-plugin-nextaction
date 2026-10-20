// Styles of the task map (#213): the view fills the panel and does not
// scroll, the canvas clipping a world that pans and zooms by transform; the
// project boxes, the no-project area and the parent tasks' boxes placed
// absolutely by the layout; fixed-width cards, their text up to two lines;
// the sequence and dependency arrows (#215) on an SVG layer above the
// cards, a card on a dependency cycle outlined red; the endpoint markers
// (#217) at a card's entry and exit; the connector, preview line and
// selected arrow of drawing and deleting dependencies (#219). Orca's CSS
// variables only, so both themes follow them.
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

/*
 * Drawing a dependency (#219): a connector on a card's right edge while the
 * pointer is on the card; the preview line; the card under the pointer
 * outlined, the danger color when it cannot depend on the one dragged from,
 * and why beside the pointer.
 */
.nextaction-task-map-connector {
  position: absolute;
  right: -6px;
  top: 50%;
  width: 10px;
  height: 10px;
  margin-top: -5px;
  box-sizing: border-box;
  border: 2px solid var(--orca-color-primary-5);
  border-radius: 50%;
  background-color: var(--orca-color-bg-1);
  cursor: crosshair;
  opacity: 0;
  outline: none;
  z-index: 2;
  touch-action: none;
}

:is(.nextaction-task-map-card, .nextaction-task-map-head):hover
  > .nextaction-task-map-connector,
.nextaction-task-map-connector:focus {
  opacity: 1;
}

.nextaction-task-map-connector:hover {
  background-color: var(--orca-color-primary-5);
}

/* While drawing: no card hover, the arrows not hit, a crosshair. */
.nextaction-task-map-viewport[data-linking],
.nextaction-task-map-viewport[data-linking] * {
  cursor: crosshair !important;
  user-select: none !important;
}

.nextaction-task-map-viewport[data-linking] .nextaction-task-map-arrow-hit {
  pointer-events: none;
}

[data-nextaction-map-link][data-link-over] > .nextaction-task-card {
  outline: 2px solid var(--orca-color-primary-5);
  outline-offset: 2px;
}

[data-nextaction-map-link][data-link-over="refused"] > .nextaction-task-card {
  outline-color: var(--orca-color-dangerous-5);
  cursor: not-allowed !important;
}

.nextaction-task-map-link-preview {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
}

.nextaction-task-map-link-preview path {
  fill: none;
  stroke: var(--orca-color-primary-5);
  stroke-width: 1.6;
  stroke-dasharray: 4 3;
}

.nextaction-task-map-link-preview path[data-refused] {
  stroke: var(--orca-color-dangerous-5);
}

.nextaction-task-map-link-reason {
  position: absolute;
  max-width: 18em;
  padding: 2px 6px;
  border: 1px solid var(--orca-color-dangerous-5);
  border-radius: var(--orca-radius-sm);
  background-color: var(--orca-color-bg-1);
  color: var(--orca-color-text-1);
  font-size: var(--orca-fontsize-sm);
  pointer-events: none;
  z-index: 3;
}

/*
 * Selecting a dependency (#219): a wide transparent line under each arrow
 * takes its clicks; the arrow selected is drawn wider in the primary color.
 */
.nextaction-task-map-arrow-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 10;
  pointer-events: stroke;
  cursor: pointer;
}

.nextaction-task-map-arrow[data-selected] {
  stroke: var(--orca-color-primary-5);
  stroke-width: 2.6;
}

/*
 * The endpoint markers (#217): a dependency's end whose other end is not on
 * the map. The entry left of the card, above the dependency badge when there
 * is one; the exit right of it. Dashed, so it reads as an arrow cut short.
 */
.nextaction-task-map-endpoint {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 3px;
  height: 18px;
  border: 1px dashed var(--orca-color-text-3);
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

.nextaction-task-map-endpoint[data-side="in"] {
  right: calc(100% + 6px);
}

.nextaction-task-map-endpoint[data-side="in"][data-badged] {
  top: calc(50% - 20px);
}

.nextaction-task-map-endpoint[data-side="out"] {
  left: calc(100% + 6px);
}

.nextaction-task-map-endpoint:hover {
  color: var(--orca-color-text-1);
  border-color: var(--orca-color-primary-5);
}

.nextaction-task-map-endpoint:focus-visible {
  outline: var(--orca-border-box);
  outline-offset: 1px;
}

.nextaction-task-map-endpoint-tip {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  max-width: 20em;
}

.nextaction-task-map-endpoint-tip-head,
.nextaction-task-map-endpoint-reveal,
.nextaction-task-map-endpoint-id {
  color: var(--orca-color-text-2);
}

.nextaction-task-map-endpoint-reveal {
  font-size: var(--orca-fontsize-xs);
}

.nextaction-task-map-endpoint-id {
  font-variant-numeric: tabular-nums;
}
`;
