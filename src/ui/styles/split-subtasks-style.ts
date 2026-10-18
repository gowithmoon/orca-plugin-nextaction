// Styles of the "Split into subtasks" window (#202), injected through the
// registry. It wears the shared window look (window-style.ts) and the AI
// draft parts' styles (ai-draft-style.ts); only its own layout is here.
// Orca's CSS variables only; class names start with `nextaction-`.

export const splitSubtasksCss = `
.nextaction-split {
  --nextaction-window-width: 30rem;
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

.nextaction-split-sequential {
  display: inline-flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
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
