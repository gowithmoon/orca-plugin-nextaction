// The My Day view (#83): its layout shell, which puts the unscheduled area
// and the timeline side by side once the view itself is wide enough, one
// above the other otherwise. The view's own width decides, not the plugin
// panel's tier: the side pane takes part of the panel. Thresholds are tuned
// after use in Orca; changing them is not a design change. Only Orca's theme
// variables; verified by hand in Orca (docs/ARCHITECTURE.md §5).

/** From this width of the view (px) on, the two areas sit side by side. */
export const myDaySideBySideWidth = 640;

export const myDayCss = `
.nextaction-my-day {
  container: nextaction-my-day / inline-size;
  min-width: 0;
}

.nextaction-my-day-layout {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-lg);
  min-width: 0;
}

.nextaction-my-day-unscheduled,
.nextaction-my-day-timeline {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
  min-width: 0;
}

.nextaction-my-day-section-title {
  margin: 0;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
  font-weight: var(--orca-fontweight-lg);
  line-height: var(--orca-lineheight-sm);
}

.nextaction-my-day-search,
.nextaction-my-day-search > * {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.nextaction-my-day-all-scheduled {
  padding: var(--orca-spacing-md) 0;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
}

/*
 * The timeline (#84): it scrolls by itself, a fixed share of the screen
 * high, so the current time can be scrolled to and the unscheduled area
 * stays in view beside or above it. 48 px an hour (timeline-geometry.ts);
 * the hours' labels in a gutter on the left, the cards in the track.
 */
.nextaction-timeline-scroll {
  height: clamp(240px, 65vh, 900px);
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
  font-size: var(--orca-fontsize-xs);
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
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 10%, var(--orca-color-bg-1));
  color: var(--orca-color-text-1);
  cursor: pointer;
}

.nextaction-timeline-card:hover {
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 16%, var(--orca-color-bg-1));
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

/* Everything but the bottom edge: what dragging the card moves (#85). */
.nextaction-timeline-card-body {
  display: flex;
  align-items: flex-start;
  gap: var(--orca-spacing-xs);
  flex: 1 1 auto;
  min-height: 0;
  padding: 2px var(--orca-spacing-xs) 0 var(--orca-spacing-sm);
}

.nextaction-timeline-card[data-compact] .nextaction-timeline-card-body {
  align-items: center;
  padding-top: 0;
}

.nextaction-timeline-card-status {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  height: calc(var(--orca-fontsize-sm) * var(--orca-lineheight-md));
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
  font-size: var(--orca-fontsize-sm);
  line-height: var(--orca-lineheight-md);
}

.nextaction-timeline-card[data-compact] .nextaction-timeline-card-text {
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--orca-fontsize-xs);
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
  font-size: var(--orca-fontsize-xs);
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

/* The bottom edge: where dragging changes the length (#85). */
.nextaction-timeline-card-resize {
  flex: 0 0 auto;
  height: 4px;
}

/* The current time: a line across the track, with a dot at its start. */
.nextaction-timeline-now {
  position: absolute;
  left: -4px;
  right: 0;
  height: 0;
  border-top: 2px solid var(--orca-color-dangerous-5);
  pointer-events: none;
  z-index: 1;
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
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.nextaction-schedule-popup-title {
  font-size: var(--orca-fontsize-md);
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-schedule-popup-task {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
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
  font-size: var(--orca-fontsize-sm);
}

.nextaction-schedule-popup-hint {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
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
    align-items: flex-start;
  }
  .nextaction-my-day-unscheduled {
    flex: 1 1 0;
  }
  .nextaction-my-day-timeline {
    flex: 1.2 1 0;
    align-self: stretch;
  }
}
`;
