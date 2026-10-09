// Styles of the reusable components (task list, task card, property row,
// status icon) and the view notices, injected through the registry. Orca's
// CSS variables only; class names start with `nextaction-`. Layout inside
// components follows their own width (container queries), not the window's
// or the panel tier's (#35 "档位与灵活布局").

export const componentCss = `
.nextaction-task-list {
  container: nextaction-task-list / inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.nextaction-task-card,
.nextaction-task-card-placeholder {
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-sm);
  background-color: var(--orca-color-bg-1);
}

.nextaction-task-card {
  display: flex;
  align-items: flex-start;
  gap: var(--orca-spacing-md);
  min-width: 0;
  padding: var(--orca-spacing-md);
}

.nextaction-task-card-placeholder {
  padding: var(--orca-spacing-md);
}

.nextaction-task-card[data-clickable] {
  cursor: pointer;
}

.nextaction-task-card[data-clickable]:hover {
  background-color: var(--orca-color-bg-2);
}

/* The task open in the task panel. */
.nextaction-task-card[data-selected] {
  border-color: var(--orca-color-primary-5);
  box-shadow: inset 3px 0 0 var(--orca-color-primary-5);
}

/* Left the list but kept while selected (#42): faded and struck through. */
.nextaction-task-card[data-kept] {
  opacity: 0.6;
}

.nextaction-task-card[data-kept] .nextaction-task-card-text {
  text-decoration: line-through;
}

.nextaction-property-kept {
  color: var(--orca-color-text-1);
  font-weight: var(--orca-fontweight-lg);
}

/* The card's small icon buttons: the status icon and "open in notes". */
.nextaction-task-card-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 0;
  border: none;
  border-radius: var(--orca-radius-sm);
  background: transparent;
  color: var(--orca-color-text-2);
  font: inherit;
  cursor: pointer;
}

.nextaction-task-card-button:hover {
  background-color: var(--orca-color-bg-2);
  color: var(--orca-color-text-1);
}

.nextaction-task-card-button:focus-visible {
  outline: var(--orca-border-box);
  outline-offset: 1px;
}

.nextaction-task-card-open {
  /* One text line high, level with the first line of the text. */
  height: calc(var(--orca-fontsize-sm) * var(--orca-lineheight-md));
  aspect-ratio: 1;
  font-size: var(--orca-fontsize-md);
}

/* Only on hover or focus, unless the pointer cannot hover. */
@media (hover: hover) {
  .nextaction-task-card:not(:hover, :focus-within) .nextaction-task-card-open {
    opacity: 0;
  }
}

.nextaction-task-card-status {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  /* One text line high, so the icon sits on the first line. */
  height: calc(var(--orca-fontsize-sm) * var(--orca-lineheight-md));
}

.nextaction-status-icon {
  display: inline-flex;
  font-size: var(--orca-fontsize-md);
  line-height: 1;
}

.nextaction-task-card-main {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  flex: 1 1 auto;
  min-width: 0;
}

.nextaction-task-card-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  line-height: var(--orca-lineheight-md);
  color: var(--orca-color-text-1);
  user-select: text;
}

.nextaction-task-card-text[data-empty] {
  color: var(--orca-color-text-2);
  font-style: italic;
}

.nextaction-property-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-xs) var(--orca-spacing-md);
  min-width: 0;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  line-height: var(--orca-lineheight-sm);
}

.nextaction-property {
  display: inline-flex;
  align-items: center;
  gap: var(--orca-spacing-xs);
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nextaction-property-chip {
  display: inline-block;
  padding: 0 var(--orca-spacing-sm);
  border-radius: var(--orca-radius-sm);
  background-color: var(--orca-color-bg-2);
  color: var(--orca-color-text-1);
}

.nextaction-property[data-overdue],
.nextaction-property-overdue {
  color: var(--orca-color-dangerous-5);
}

.nextaction-property-overdue {
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-property-anomaly {
  color: var(--orca-color-text-yellow);
}

/* A narrow list: tighter cards, so the text keeps its room. */
@container nextaction-task-list (max-width: 320px) {
  .nextaction-task-card {
    gap: var(--orca-spacing-sm);
    padding: var(--orca-spacing-sm);
  }
  .nextaction-property-row {
    column-gap: var(--orca-spacing-sm);
  }
}

.nextaction-view-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--orca-spacing-sm);
  padding: var(--orca-spacing-lg) var(--orca-spacing-md);
  color: var(--orca-color-text-2);
  text-align: center;
  overflow-wrap: anywhere;
}

.nextaction-view-notice > .ti {
  font-size: var(--orca-fontsize-lg);
}

.nextaction-view-notice-title {
  color: var(--orca-color-text-1);
  font-weight: var(--orca-fontweight-lg);
}
`;
