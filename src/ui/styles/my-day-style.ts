// The My Day view (#83): its layout shell, which puts the unscheduled area
// and the timeline side by side once the view itself is wide enough, one
// above the other otherwise. The view's own width decides, not the plugin
// panel's tier: the side pane takes part of the panel. The shell fills the
// view's height and each area scrolls by itself, so the timeline takes all
// the room there is (one above the other, the unscheduled area takes at most
// a share of it). Thresholds are tuned
// after use in Orca; changing them is not a design change. Only Orca's theme
// variables; verified by hand in Orca (docs/ARCHITECTURE.md §5).

/** From this width of the view (px) on, the two areas sit side by side. */
export const myDaySideBySideWidth = 640;

export const myDayCss = `
.nextaction-my-day {
  container: nextaction-my-day / inline-size;
  display: flex;
  flex-direction: column;
  /* The view's height; below this the plugin panel's view scrolls instead. */
  height: 100%;
  min-height: 26rem;
  min-width: 0;
}

.nextaction-my-day-layout {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-lg);
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.nextaction-my-day-unscheduled,
.nextaction-my-day-timeline {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
  min-width: 0;
  min-height: 0;
}

/* One above the other: the unscheduled area as tall as it needs, up to a share. */
.nextaction-my-day-unscheduled {
  flex: 0 1 auto;
  max-height: 40%;
}

.nextaction-my-day-timeline {
  flex: 1 1 0;
}

.nextaction-my-day-section-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

/* The title, and beside it (the unscheduled area) the search box. */
.nextaction-my-day-section-header {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  flex: 0 0 auto;
  min-width: 0;
  min-height: var(--orca-height-segmented);
}

.nextaction-my-day-section-title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--orca-color-text-2);
  font-size: var(--nextaction-fontsize-sm);
  font-weight: var(--orca-fontweight-lg);
  line-height: var(--orca-lineheight-sm);
}

.nextaction-my-day-search {
  flex: 0 1 14em;
  min-width: 8em;
}

.nextaction-my-day-search > * {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

/* Orca's Select button has no frame of its own; a search box needs one to be seen. */
.nextaction-my-day-search .nextaction-my-day-search-button {
  box-sizing: border-box;
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-md);
  background-color: var(--orca-color-bg-1);
}

.nextaction-my-day-search .nextaction-my-day-search-button:hover {
  border-color: var(--orca-color-text-2);
}

/*
 * A press anywhere on a card in My Day starts a drag (#85): its text is not
 * selectable here, as in the all tasks view's handle; the task panel shows
 * the text to copy.
 */
.nextaction-my-day-unscheduled-item,
.nextaction-my-day-unscheduled-item .nextaction-task-card-text,
.nextaction-timeline-card {
  user-select: none;
}

/*
 * Nothing unscheduled: one quiet line, so the timeline keeps the room. Tall
 * enough still to drop a timeline card on (#85).
 */
.nextaction-my-day-unscheduled-empty {
  min-height: 2.5em;
  padding: var(--orca-spacing-sm) 0;
  color: var(--orca-color-text-2);
  font-size: var(--nextaction-fontsize-sm);
  line-height: var(--orca-lineheight-md);
}

.nextaction-my-day-unscheduled-empty-title {
  color: var(--orca-color-text-1);
  font-weight: var(--orca-fontweight-lg);
}

/*
 * The timeline (#84): it scrolls by itself, filling the room its area has,
 * so the current time can be scrolled to and the unscheduled area stays in
 * view beside or above it. 48 px an hour (timeline-geometry.ts); the hours'
 * labels in a gutter on the left, the cards in the track.
 */
.nextaction-timeline-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--orca-color-border) 60%, transparent);
  border-radius: var(--orca-radius-md);
  background-color: var(--orca-color-bg-1);
}

.nextaction-timeline {
  --nextaction-timeline-gutter: 3rem;
  position: relative;
  min-width: 0;
}

.nextaction-timeline-hours {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;
}

/* A whole hour: a faint line across, its clock time in the gutter. */
.nextaction-timeline-hour {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px solid color-mix(in srgb, var(--orca-color-border) 50%, transparent);
}

.nextaction-timeline-hour-label {
  position: absolute;
  top: 0;
  left: 0;
  width: calc(var(--nextaction-timeline-gutter) - var(--orca-spacing-sm));
  transform: translateY(-50%);
  padding-right: var(--orca-spacing-xs);
  background-color: var(--orca-color-bg-1);
  color: var(--orca-color-text-2);
  font-size: var(--nextaction-fontsize-xs);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* An hour on the top edge (a whole-hour day boundary): its label goes below the line. */
.nextaction-timeline-hour[data-top] .nextaction-timeline-hour-label {
  transform: none;
}

.nextaction-timeline-track {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--nextaction-timeline-gutter);
  right: var(--orca-spacing-sm);
}

/*
 * A scheduled task: placed by its schedule (top, height) and its lane
 * (--nextaction-lane of --nextaction-lanes, timeline-lanes.ts).
 */
.nextaction-timeline-card {
  position: absolute;
  left: calc(100% * var(--nextaction-lane) / var(--nextaction-lanes));
  width: calc(100% / var(--nextaction-lanes) - 2px);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--orca-color-primary-5) 35%, transparent);
  border-left: 3px solid var(--orca-color-primary-5);
  border-radius: var(--orca-radius-sm);
  /* Over the current time line, which shows through it, faintly. */
  z-index: 1;
  background-color: color-mix(
    in srgb,
    color-mix(in srgb, var(--orca-color-primary-5) 10%, var(--orca-color-bg-1)) 78%,
    transparent
  );
  color: var(--orca-color-text-1);
  cursor: pointer;
  /* Its edges and buttons stack within it, never over a menu. */
  isolation: isolate;
}

.nextaction-timeline-card:hover {
  background-color: color-mix(
    in srgb,
    color-mix(in srgb, var(--orca-color-primary-5) 16%, var(--orca-color-bg-1)) 78%,
    transparent
  );
}

.nextaction-timeline-card:focus-visible {
  outline: var(--orca-border-box);
  outline-offset: 1px;
}

.nextaction-timeline-card[data-selected] {
  border-color: var(--orca-color-primary-5);
  box-shadow: 0 0 0 1px var(--orca-color-primary-5);
}

/* Done: faded, left where it is, so the timeline records the day. */
/* Only faded, not struck through, as kept cards (#45). */
.nextaction-timeline-card[data-done] {
  opacity: 0.55;
}

/* Everything but the edges: what dragging the card moves (#85). */
.nextaction-timeline-card-body {
  display: flex;
  align-items: flex-start;
  gap: var(--orca-spacing-xs);
  flex: 1 1 auto;
  min-height: 0;
  padding: calc(var(--orca-spacing-xs) / 2) var(--orca-spacing-xs) 0 var(--orca-spacing-sm);
}

.nextaction-timeline-card[data-compact] .nextaction-timeline-card-body {
  align-items: center;
  padding-top: 0;
}

.nextaction-timeline-card-status {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  height: calc(var(--nextaction-fontsize-sm) * var(--orca-lineheight-md));
}

.nextaction-timeline-card-main {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
}

.nextaction-timeline-card-text {
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: var(--nextaction-fontsize-sm);
  line-height: var(--orca-lineheight-md);
}

.nextaction-timeline-card[data-compact] .nextaction-timeline-card-text {
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--nextaction-fontsize-xs);
}

.nextaction-timeline-card-text[data-empty] {
  color: var(--orca-color-text-2);
}

.nextaction-timeline-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-xs);
  color: var(--orca-color-text-2);
  font-size: var(--nextaction-fontsize-xs);
  font-variant-numeric: tabular-nums;
}

/* Overdue on a card too short for the tag. */
.nextaction-timeline-card-overdue-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--orca-color-dangerous-5);
}

.nextaction-timeline-card .nextaction-task-card-extra {
  flex: 0 0 auto;
}

/*
 * The top and bottom edges: where dragging changes the start or the end
 * (#85). Laid over the card's rim, so a short card keeps its body; over the
 * body's buttons, which sit away from the rim.
 */
.nextaction-timeline-card-edge {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1;
  height: 6px;
  cursor: ns-resize;
  touch-action: none;
}

.nextaction-timeline-card-edge[data-edge="start"] {
  top: 0;
}

.nextaction-timeline-card-edge[data-edge="end"] {
  bottom: 0;
}

/* The edge under the pointer shows where to grab. */
.nextaction-timeline-card-edge:hover {
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 35%, transparent);
}

/* A short card keeps most of its height for its body. */
.nextaction-timeline-card[data-compact] .nextaction-timeline-card-edge {
  height: 3px;
}

/* The buttons stay above the edges. */
.nextaction-timeline-card .nextaction-task-card-button {
  position: relative;
  z-index: 2;
}

/*
 * Dragging (#85, my-day-drag.tsx). The chip and the preview take no pointer,
 * so what lies under it is the place to drop.
 */
.nextaction-my-day-layout {
  position: relative;
}

.nextaction-my-day-layout[data-dragging] {
  user-select: none;
  cursor: grabbing;
}

.nextaction-my-day-layout[data-dragging="resize-start"],
.nextaction-my-day-layout[data-dragging="resize-end"] {
  cursor: ns-resize;
}

.nextaction-my-day-layout[data-dragging] * {
  cursor: inherit;
}

/* The card being dragged stays where it is, faded. */
/* Over a done card's own fading (same weight, later). */
.nextaction-my-day-layout [data-nextaction-drag-source] {
  opacity: 0.4;
}

/* A timeline card would be unscheduled here. */
.nextaction-my-day-unscheduled[data-drop-over] {
  outline: 2px dashed var(--orca-color-primary-5);
  outline-offset: 4px;
  border-radius: var(--orca-radius-md);
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 6%, transparent);
}

/* Where it would go, snapped, with its times. */
.nextaction-timeline-preview {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 0;
  overflow: hidden;
  /* As the card body, less the 1px its dashed border is wider by. */
  padding: calc(var(--orca-spacing-xs) / 2 - 1px) var(--orca-spacing-sm);
  border: 2px dashed var(--orca-color-primary-5);
  border-radius: var(--orca-radius-sm);
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 18%, var(--orca-color-bg-1));
  color: var(--orca-color-text-1);
  font-size: var(--nextaction-fontsize-xs);
  line-height: var(--orca-lineheight-sm);
  pointer-events: none;
}

.nextaction-timeline-preview-times {
  font-weight: var(--orca-fontweight-lg);
  font-variant-numeric: tabular-nums;
}

.nextaction-timeline-preview-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* The dragged task under the pointer, off the timeline; placed by transform. */
.nextaction-my-day-drag-chip {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3;
  max-width: 240px;
  padding: var(--orca-spacing-xs) var(--orca-spacing-sm);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--nextaction-fontsize-sm);
  color: var(--orca-color-text-1);
  background-color: var(--orca-color-bg-1);
  border: var(--orca-border-box);
  border-radius: var(--orca-radius-sm);
  box-shadow: var(--orca-shadow-popup);
  pointer-events: none;
}

/* The current time: a line across the track, with a dot at its start; under the cards. */
.nextaction-timeline-now {
  position: absolute;
  left: -4px;
  right: 0;
  height: 0;
  border-top: 2px solid var(--orca-color-dangerous-5);
  pointer-events: none;
  z-index: 0;
}

.nextaction-timeline-now::before {
  content: "";
  position: absolute;
  top: -5px;
  left: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--orca-color-dangerous-5);
}

/* The schedule popup (schedule-popup.tsx), in the shared window look. */
.nextaction-schedule-popup {
  --nextaction-window-width: 22rem;
}

.nextaction-schedule-popup-header {
  display: flex;
  align-items: flex-start;
  gap: var(--orca-spacing-sm);
  flex: 0 0 auto;
  padding: var(--orca-spacing-md) var(--orca-spacing-md) 0 var(--orca-spacing-lg);
}

.nextaction-schedule-popup-heading {
  display: flex;
  flex-direction: column;
  gap: calc(var(--orca-spacing-xs) / 2);
  flex: 1 1 auto;
  min-width: 0;
}

.nextaction-schedule-popup-title {
  font-size: var(--nextaction-fontsize-md);
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-schedule-popup-task {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--orca-color-text-2);
  font-size: var(--nextaction-fontsize-sm);
}

.nextaction-schedule-popup-body {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
  padding: var(--orca-spacing-md) var(--orca-spacing-lg) var(--orca-spacing-lg);
}

.nextaction-schedule-popup-field {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  min-width: 0;
}

.nextaction-schedule-popup-label {
  color: var(--orca-color-text-2);
  font-size: var(--nextaction-fontsize-sm);
}

.nextaction-schedule-popup-hint {
  color: var(--orca-color-text-2);
  font-size: var(--nextaction-fontsize-xs);
}

.nextaction-schedule-popup-footer {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  flex: 0 0 auto;
  padding: var(--orca-spacing-md) var(--orca-spacing-lg);
  border-top: var(--orca-border-separator);
  background-color: var(--orca-color-bg-2);
}

.nextaction-schedule-popup-spacer {
  flex: 1 1 auto;
}

@container nextaction-my-day (min-width: ${myDaySideBySideWidth}px) {
  .nextaction-my-day-layout {
    flex-direction: row;
  }
  .nextaction-my-day-unscheduled {
    flex: 1 1 0;
    max-height: none;
  }
  .nextaction-my-day-timeline {
    flex: 1.2 1 0;
  }
}
`;
