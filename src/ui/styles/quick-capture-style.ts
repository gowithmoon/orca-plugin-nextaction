// Styles of the quick capture window (#45 "快速捕获"), injected through the
// registry. It wears the shared window look (window-style.ts) and reuses the
// task panel's field styles (task-panel-style.ts), both injected by the popup
// styles feature (platform/popup-style-feature.ts); only its own layout is
// here. Orca's CSS variables only; class names start with `nextaction-`.
//
// Narrow enough that the fields fill it: labels to the left and short, the
// ratings and dates at their full width, nothing left over to their right.

export const quickCaptureCss = `
.nextaction-capture {
  --nextaction-window-width: 26rem;
  --nextaction-field-label-width: 4.5rem;
}

.nextaction-capture-header {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  flex: 0 0 auto;
  padding: var(--orca-spacing-md) var(--orca-spacing-md) 0 var(--orca-spacing-lg);
}

.nextaction-capture-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--orca-fontsize-md);
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-capture-body {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-lg);
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--orca-spacing-md) var(--orca-spacing-lg) var(--orca-spacing-lg);
}

/*
 * The line of text leads the window: full width, and a size up from the
 * fields (the window sets that on the input itself, quick-capture-popup.tsx).
 */
.nextaction-capture-text {
  width: 100%;
}

/*
 * The fields lay out by the width of this container as they do by the task
 * panel's (labels to the left, task-panel-style.ts), a little closer together.
 */
.nextaction-capture-fields {
  container: nextaction-capture-fields / inline-size;
}

.nextaction-capture-fields .nextaction-task-fields {
  gap: var(--orca-spacing-sm);
}

.nextaction-capture-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-sm);
  flex: 0 0 auto;
  padding: var(--orca-spacing-md) var(--orca-spacing-lg);
  border-top: var(--orca-border-separator);
  background-color: var(--orca-color-bg-2);
}

.nextaction-capture-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--orca-spacing-xs);
  flex: 1 1 auto;
  min-width: 0;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
}
`;
