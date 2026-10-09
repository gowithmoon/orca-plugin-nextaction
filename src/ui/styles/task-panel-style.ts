// Styles of the task panel (form and popup shell), injected through the
// registry. Orca's CSS variables only; class names start with `nextaction-`.
// Layout follows the panel's own width (container queries, #35 "档位与灵活布局"):
// labels to the left from 420px, above the fields below that; status buttons
// in three columns and two rows when very narrow.

export const taskPanelCss = `
.nextaction-task-panel-popup {
  width: min(32rem, calc(100vw - 2 * var(--orca-spacing-lg)));
  max-height: calc(100vh - 4 * var(--orca-spacing-lg));
  margin: calc(2 * var(--orca-spacing-lg)) auto 0;
  display: flex;
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-sm);
  background-color: var(--orca-color-bg-1);
  overflow: hidden;
}

.nextaction-task-panel {
  container: nextaction-task-panel / inline-size;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  color: var(--orca-color-text-1);
}

.nextaction-task-panel-header {
  display: flex;
  align-items: flex-start;
  gap: var(--orca-spacing-sm);
  padding: var(--orca-spacing-md);
  border-bottom: 1px solid var(--orca-color-border);
}

.nextaction-task-panel-header > .nextaction-status-icon {
  /* One text line high, so the icon sits on the first line. */
  height: calc(var(--orca-fontsize-md) * var(--orca-lineheight-md));
  align-items: center;
}

.nextaction-task-panel-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  line-height: var(--orca-lineheight-md);
  font-weight: var(--orca-fontweight-lg);
  user-select: text;
}

.nextaction-task-panel-title[data-empty] {
  color: var(--orca-color-text-2);
  font-style: italic;
  font-weight: normal;
}

.nextaction-task-panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: var(--orca-spacing-md);
}

.nextaction-task-fields {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
}

.nextaction-task-field {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  min-width: 0;
}

.nextaction-task-field-label {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-task-field-control {
  min-width: 0;
}

@container nextaction-task-panel (min-width: 420px) {
  .nextaction-task-field {
    flex-direction: row;
    align-items: center;
    gap: var(--orca-spacing-md);
  }
  .nextaction-task-field-label {
    flex: 0 0 6rem;
  }
  .nextaction-task-field-control {
    flex: 1 1 auto;
  }
}

/* Fieldsets group the buttons for assistive technology; no box of their own. */
.nextaction-status-buttons,
.nextaction-rating-cells,
.nextaction-choices-field {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.nextaction-status-buttons {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--orca-spacing-xs);
}

@container nextaction-task-panel (max-width: 360px) {
  .nextaction-status-buttons {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.nextaction-status-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--orca-spacing-xs);
  min-width: 0;
  padding: var(--orca-spacing-xs);
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-sm);
  background-color: transparent;
  color: var(--orca-color-text-2);
  font: inherit;
  font-size: var(--orca-fontsize-xs);
  cursor: pointer;
}

.nextaction-status-button > .ti {
  color: var(--nextaction-status-color);
  font-size: var(--orca-fontsize-md);
}

.nextaction-status-button:hover {
  background-color: var(--orca-color-bg-2);
}

.nextaction-status-button[data-current] {
  border-color: var(--nextaction-status-color);
  background-color: var(--orca-color-bg-2);
  color: var(--orca-color-text-1);
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-status-button-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nextaction-rating {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-md);
  min-width: 0;
}

.nextaction-rating-cells {
  display: flex;
  gap: var(--orca-spacing-xs);
  flex: 1 1 auto;
  max-width: 14rem;
}

.nextaction-rating-cell {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  height: 1.25rem;
  padding: 0;
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-sm);
  background-color: transparent;
  cursor: pointer;
}

.nextaction-rating-cell:hover {
  background-color: var(--orca-color-bg-2);
}

.nextaction-rating-cell[data-filled] {
  border-color: var(--orca-color-primary-5);
  background-color: var(--orca-color-primary-5);
  opacity: 0.55;
}

.nextaction-rating-cell[data-current] {
  opacity: 1;
}

/*
 * The default level (4) carries a small dot, centred without a spacing
 * offset. Its 4px size and 2px inset are the mark's own geometry inside a
 * 1.25rem cell, not spacing between elements; no Orca variable stands for it.
 */
.nextaction-rating-cell[data-default]::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 2px;
  width: 4px;
  height: 4px;
  transform: translateX(-50%);
  border-radius: 50%;
  background-color: var(--orca-color-text-2);
}

.nextaction-rating-cell:focus-visible,
.nextaction-status-button:focus-visible {
  outline: 2px solid var(--orca-color-primary-5);
  outline-offset: 1px;
}

.nextaction-rating-name {
  flex: 0 0 auto;
  color: var(--orca-color-text-1);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-date-field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-sm);
}

.nextaction-date-trigger {
  display: inline-flex;
}

.nextaction-date-trigger [data-overdue] {
  color: var(--orca-color-dangerous-5);
}

.nextaction-note-field {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  min-width: 0;
}

.nextaction-note-field > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}

.nextaction-note-saved {
  flex: 0 0 auto;
  color: var(--orca-color-text-green);
  font-size: var(--orca-fontsize-xs);
  animation: nextaction-fade-out 2s ease-in forwards;
}

@keyframes nextaction-fade-out {
  0%, 60% { opacity: 1; }
  100% { opacity: 0; }
}

.nextaction-task-panel-footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  border-top: 1px solid var(--orca-color-border);
}
`;
