// Styles of the parts every AI draft window shares (ai-draft-parts.tsx:
// "Split into subtasks" #202, "Extract tasks" #204), injected through the
// registry by the popup styles feature. Orca's CSS variables only; class
// names start with `nextaction-`.

export const aiDraftCss = `
.nextaction-ai-body {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: var(--orca-spacing-md) var(--orca-spacing-lg) var(--orca-spacing-lg);
}

.nextaction-ai-lead {
  margin: 0;
  color: var(--orca-color-text-2);
}

.nextaction-ai-question {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
}

.nextaction-ai-waiting {
  flex-direction: row;
  align-items: center;
  gap: var(--orca-spacing-sm);
  color: var(--orca-color-text-2);
}

.nextaction-ai-waiting .ti {
  animation: nextaction-ai-spin 1s linear infinite;
}

@keyframes nextaction-ai-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nextaction-ai-waiting .ti {
    animation: none;
  }
}

.nextaction-ai-uncertain {
  display: flex;
  align-items: baseline;
  gap: var(--orca-spacing-xs);
  margin-top: calc(var(--orca-spacing-xs) / 2);
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
}

.nextaction-ai-badge {
  flex: 0 0 auto;
  padding: 0 var(--orca-spacing-xs);
  border-radius: var(--orca-radius-md);
  background-color: var(--orca-color-warning-1, var(--orca-color-bg-2));
  color: var(--orca-color-warning-5, var(--orca-color-text-1));
}
`;
