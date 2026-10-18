// Styles of the "Extract tasks" window (#204), injected through the
// registry. It wears the shared window look (window-style.ts), the AI draft
// parts' styles (ai-draft-style.ts) and the task panel's date fields
// (task-panel-style.ts), all injected by the popup styles feature; only its
// own layout is here. Orca's CSS variables only; class names start with
// `nextaction-`.

export const extractTasksCss = `
.nextaction-extract {
  --nextaction-window-width: 34rem;
}

.nextaction-extract-rows {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
  margin: 0;
  padding: 0;
  list-style: none;
}

.nextaction-extract-row {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  padding-bottom: var(--orca-spacing-md);
  border-bottom: 1px solid var(--orca-color-border);
}

.nextaction-extract-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

/* An unticked item stays editable but steps back. */
.nextaction-extract-row[data-unchecked] > :not(.nextaction-extract-row-main),
.nextaction-extract-row[data-unchecked] .nextaction-extract-row-main > :last-child {
  opacity: 0.55;
}

.nextaction-extract-row-main {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
}

.nextaction-extract-row-main > :last-child {
  flex: 1 1 auto;
  min-width: 0;
}

/* Checkbox-wide indent, so dates, quote and doubt line up under the name. */
.nextaction-extract-row > :not(.nextaction-extract-row-main) {
  margin-left: calc(1rem + var(--orca-spacing-sm));
}

.nextaction-extract-row-dates {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--orca-spacing-xs) var(--orca-spacing-sm);
}

/* A narrow screen: each date on its own line. */
@media (max-width: 30rem) {
  .nextaction-extract-row-dates {
    grid-template-columns: auto minmax(0, 1fr);
  }
}

.nextaction-extract-date-label {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-extract-quote {
  margin: 0;
  padding-left: var(--orca-spacing-sm);
  border-left: 2px solid var(--orca-color-border);
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.nextaction-extract-placement {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-sm);
}

.nextaction-extract-placement-label {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-extract-hint {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
}

.nextaction-extract-footer-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--orca-spacing-xs);
  flex: 1 1 auto;
  min-width: 0;
}

.nextaction-extract-nothing {
  flex-direction: row;
  align-items: flex-start;
  gap: var(--orca-spacing-sm);
  color: var(--orca-color-text-2);
}
`;
