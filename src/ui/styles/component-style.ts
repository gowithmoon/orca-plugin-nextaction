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
  gap: var(--orca-spacing-md);
  margin: 0;
  padding: 0;
  list-style: none;
}

/*
 * The card and its loading placeholder look alike (#45 "任务卡片"): a light
 * border, the window's radius, roomy padding.
 */
.nextaction-task-card,
.nextaction-task-card-placeholder {
  border: 1px solid color-mix(in srgb, var(--orca-color-border) 60%, transparent);
  border-radius: var(--orca-radius-md);
  background-color: var(--orca-color-bg-1);
  padding: var(--orca-spacing-md) var(--orca-spacing-lg);
}

.nextaction-task-card {
  display: flex;
  align-items: flex-start;
  gap: var(--orca-spacing-md);
  min-width: 0;
}

.nextaction-task-card[data-clickable] {
  cursor: pointer;
}

.nextaction-task-card[data-clickable]:hover {
  border-color: var(--orca-color-border);
  background-color: var(--orca-color-bg-2);
}

.nextaction-task-card:focus-visible {
  outline: var(--orca-border-box);
  outline-offset: 1px;
}

/* The task open in the task panel: a primary border on a faint primary ground. */
.nextaction-task-card[data-selected],
.nextaction-task-card[data-selected]:hover {
  border-color: var(--orca-color-primary-5);
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 8%, var(--orca-color-bg-1));
}

/* Left the list but kept while selected (#42): only faded, not struck through (#45). */
.nextaction-task-card[data-kept] {
  opacity: 0.6;
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
  /* The items are told apart by this spacing and their icons or grounds. */
  gap: var(--orca-spacing-xs) var(--orca-spacing-lg);
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

/* A pill tinted from the text colour, so it shows on a selected card's ground too. */
.nextaction-property-chip {
  display: inline-block;
  padding: 0 var(--orca-spacing-md);
  border-radius: calc(var(--orca-fontsize-xs) * var(--orca-lineheight-sm));
  background-color: color-mix(in srgb, var(--orca-color-text-2) 12%, transparent);
  color: var(--orca-color-text-1);
}

/* Overdue: the whole due item turns red and carries an "overdue" tag. */
.nextaction-property[data-overdue],
.nextaction-property-overdue {
  color: var(--orca-color-dangerous-5);
}

.nextaction-property-overdue {
  padding: 0 var(--orca-spacing-xs);
  border-radius: var(--orca-radius-sm);
  background-color: color-mix(in srgb, var(--orca-color-dangerous-5) 12%, transparent);
  font-weight: var(--orca-fontweight-lg);
}

/* Importance and effort: faded at the default level, importance bold from "high" up. */
.nextaction-property-rating[data-default] {
  opacity: 0.7;
}

.nextaction-property-rating[data-strong] {
  color: var(--orca-color-text-1);
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-property-anomaly {
  color: var(--orca-color-text-yellow);
}

/* A narrow list: tighter cards, so the text keeps its room. */
@container nextaction-task-list (max-width: 320px) {
  .nextaction-task-card,
  .nextaction-task-card-placeholder {
    padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  }
  .nextaction-task-card {
    gap: var(--orca-spacing-sm);
  }
  .nextaction-property-row {
    column-gap: var(--orca-spacing-md);
  }
}

/* Empty, paused, failed (#48): centred, a large icon, then the title and
   the detail as two levels, below the view title's. */
.nextaction-view-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--orca-spacing-xs);
  padding: calc(var(--orca-spacing-lg) * 2) var(--orca-spacing-md);
  color: var(--orca-color-text-2);
  text-align: center;
  overflow-wrap: anywhere;
}

.nextaction-view-notice > .ti {
  margin-bottom: var(--orca-spacing-sm);
  font-size: calc(var(--orca-fontsize-lg) * 2);
  line-height: 1;
}

.nextaction-view-notice-title {
  color: var(--orca-color-text-1);
  font-size: var(--orca-fontsize-md);
  font-weight: var(--orca-fontweight-lg);
}

.nextaction-view-notice-detail {
  max-width: 36em;
  font-size: var(--orca-fontsize-sm);
  line-height: var(--orca-lineheight-md);
}

.nextaction-view-notice-action {
  margin-top: var(--orca-spacing-md);
}
`;
