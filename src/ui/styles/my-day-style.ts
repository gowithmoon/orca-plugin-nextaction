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

/* The timeline's place (#84): marked out only, so the layout shows. */
.nextaction-my-day-timeline {
  min-height: 120px;
  border: 1px dashed var(--orca-color-border);
  border-radius: var(--orca-radius-md);
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
