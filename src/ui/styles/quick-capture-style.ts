// Styles of the quick capture window (#45 "快速捕获"), injected through the
// registry. It wears the shared window look (window-style.ts) and reuses the
// task panel's field styles (task-panel-style.ts); only its own layout is
// here. Orca's CSS variables only; class names start with `nextaction-`.

export const quickCaptureCss = `
.nextaction-capture-header {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  flex: 0 0 auto;
  padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  border-bottom: var(--orca-border-separator);
}

.nextaction-capture-title {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-capture-body {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--orca-spacing-md);
}

.nextaction-capture-text {
  width: 100%;
}

/*
 * The task panel's fields lay out by the width of a container named
 * nextaction-task-panel (labels to the left from 420px); this one gives them
 * the same layout here.
 */
.nextaction-capture-fields {
  container: nextaction-task-panel / inline-size;
}

.nextaction-capture-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-sm);
  flex: 0 0 auto;
  padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  border-top: var(--orca-border-separator);
}

.nextaction-capture-hint {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
}
`;
