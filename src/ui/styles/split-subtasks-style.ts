// Styles of the "Split into subtasks" window (#202), injected through the
// registry. It wears the shared window look (window-style.ts); only its own
// layout is here. Orca's CSS variables only; class names start with
// `nextaction-`.

export const splitSubtasksCss = `
.nextaction-split {
  --nextaction-window-width: 30rem;
}

.nextaction-split-body {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--orca-spacing-md) var(--orca-spacing-lg) var(--orca-spacing-lg);
}

.nextaction-split-lead {
  margin: 0;
  color: var(--orca-color-text-2);
}

.nextaction-split-question {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
}

.nextaction-split-waiting {
  flex-direction: row;
  align-items: center;
  gap: var(--orca-spacing-sm);
  color: var(--orca-color-text-2);
}

.nextaction-split-waiting .ti {
  animation: nextaction-split-spin 1s linear infinite;
}

@keyframes nextaction-split-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nextaction-split-waiting .ti {
    animation: none;
  }
}

.nextaction-split-not-splittable {
  display: flex;
  align-items: flex-start;
  gap: var(--orca-spacing-sm);
  padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  border-radius: var(--orca-radius-md);
  background-color: var(--orca-color-bg-2);
  color: var(--orca-color-text-2);
}

.nextaction-split-rows {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.nextaction-split-row-main {
  display: flex;
  align-items: center;
  gap: calc(var(--orca-spacing-xs) / 2);
}

.nextaction-split-row-main > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}

.nextaction-split-uncertain {
  display: flex;
  align-items: baseline;
  gap: var(--orca-spacing-xs);
  margin-top: calc(var(--orca-spacing-xs) / 2);
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
}

.nextaction-split-badge {
  flex: 0 0 auto;
  padding: 0 var(--orca-spacing-xs);
  border-radius: var(--orca-radius-md);
  background-color: var(--orca-color-warning-1, var(--orca-color-bg-2));
  color: var(--orca-color-warning-5, var(--orca-color-text-1));
}

.nextaction-split-sequential {
  display: inline-flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  cursor: pointer;
}

.nextaction-split-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--orca-spacing-xs);
  flex: 1 1 auto;
  min-width: 0;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
}
`;
