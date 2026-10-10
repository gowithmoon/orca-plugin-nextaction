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

/* "Open in notes" and a view's own buttons beside it (task-card.tsx \`buttons\`). */
.nextaction-task-card-open,
.nextaction-task-card-extra {
  /* One text line high, level with the first line of the text. */
  height: calc(var(--orca-fontsize-sm) * var(--orca-lineheight-md));
  aspect-ratio: 1;
  font-size: var(--orca-fontsize-md);
}

/* Only on hover or focus, unless the pointer cannot hover. */
@media (hover: hover) {
  .nextaction-task-card:not(:hover, :focus-within)
    :is(.nextaction-task-card-open, .nextaction-task-card-extra) {
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

/* The parent task's text (#55): one faint line above the task's own, cut short. */
.nextaction-task-card-parent {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-xs);
  min-width: 0;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  line-height: var(--orca-lineheight-sm);
}

.nextaction-task-card-parent > .ti {
  flex: 0 0 auto;
}

.nextaction-task-card-parent-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nextaction-task-card-parent[data-empty] .nextaction-task-card-parent-text {
  font-style: italic;
}

/* Read by screen readers, not shown. */
.nextaction-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/*
 * The filter bars (#55, #69): the fields side by side, sharing the row while
 * it is short and stopping at a width that reads well when it is long;
 * wrapping only when the view is really narrow, never wider than it.
 */
.nextaction-filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orca-spacing-sm);
  min-width: 0;
  margin: 0 0 var(--orca-spacing-md);
  padding: 0;
  border: 0;
}

.nextaction-filter {
  flex: 1 1 7em;
  min-width: 0;
  max-width: 12em;
  margin: 0;
  padding: 0;
  border: 0;
}

/*
 * The all tasks view's toolbar (#69). Its parts, in reading order: the
 * search box, the view controls (sort, direction, collapse or expand all),
 * then the filter fields. Laid out by its own width:
 * - narrow: the search box and the view controls share the first row, the
 *   five filters fill rows of two below, the last one alone;
 * - medium: the same two rows;
 * - wide: one row, the filters after the search box and the view controls
 *   at the far end, where controls of how a list shows usually sit.
 * The search box and the filters stop growing at a width that reads well.
 */
.nextaction-toolbar {
  container: nextaction-toolbar / inline-size;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-sm);
  min-width: 0;
  margin: 0 0 var(--orca-spacing-md);
}

.nextaction-toolbar > .nextaction-filter-search {
  flex: 1 1 10em;
  min-width: 8em;
  max-width: 22em;
}

.nextaction-toolbar-view {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-xs);
  flex: 0 0 auto;
  margin-inline-start: auto;
}

/* Its own row below the others. */
.nextaction-toolbar > .nextaction-filter-bar {
  flex: 1 1 100%;
  margin: 0;
}

@container nextaction-toolbar (max-width: 440px) {
  .nextaction-toolbar .nextaction-filter {
    flex: 1 1 40%;
    max-width: none;
  }
}

@container nextaction-toolbar (min-width: 1000px) {
  .nextaction-toolbar > .nextaction-filter-bar {
    order: 1;
    flex: 1 1 36em;
    max-width: 60em;
  }
  .nextaction-toolbar-view {
    order: 2;
  }
}

/* The sort picker (#68): as wide as its longest choice needs. */
.nextaction-sort {
  flex: 0 1 9em;
  min-width: 7em;
  margin: 0;
  padding: 0;
  border: 0;
}

.nextaction-toolbar-button {
  flex: 0 0 auto;
}

/* The search box's parts stay inside it. */
.nextaction-filter-search > *,
.nextaction-filter-search input {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.nextaction-search-clear {
  height: 1.5em;
  aspect-ratio: 1;
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

/*
 * Importance, urgency and effort: faded at the default level, importance and
 * urgency bold from "high" up.
 */
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

/* Blocked (#65): a tag in the danger colour, like "overdue". */
.nextaction-property-blocked {
  padding: 0 var(--orca-spacing-xs);
  border-radius: var(--orca-radius-sm);
  background-color: color-mix(in srgb, var(--orca-color-dangerous-5) 12%, transparent);
  color: var(--orca-color-dangerous-5);
  font-weight: var(--orca-fontweight-lg);
}

/*
 * The all tasks view's tree (#65): subtasks under their parent's card,
 * indented a step per level along a faint guide line. The indent stays
 * small, so deep trees still fit a narrow panel without scrolling sideways.
 */
.nextaction-task-tree li,
.nextaction-task-tree-children {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
  min-width: 0;
}

.nextaction-task-tree-children {
  margin: 0 0 0 var(--orca-spacing-md);
  padding: 0 0 0 var(--orca-spacing-md);
  border-left: 1px solid color-mix(in srgb, var(--orca-color-border) 60%, transparent);
  list-style: none;
}

/*
 * Collapsing (#67): a node's toggle sits left of its card, and leaves keep
 * an empty slot of the same width so the cards of a level stay in line.
 * A collapsed node says under its card how many tasks it hides.
 */
.nextaction-task-tree-row {
  display: flex;
  align-items: flex-start;
  gap: var(--orca-spacing-xs);
  min-width: 0;
}

.nextaction-task-tree-row > :last-child {
  flex: 1 1 auto;
  min-width: 0;
}

.nextaction-task-tree-toggle {
  flex: 0 0 auto;
  width: 1.25em;
  height: 1.25em;
  margin-top: var(--orca-spacing-md);
}

/*
 * The all tasks view's done section (#66), below the tree: a quiet title
 * that toggles it, its cards, then "show earlier".
 */
.nextaction-done-section {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
  margin-top: var(--orca-spacing-lg);
}

.nextaction-done-section-toggle,
.nextaction-done-section-earlier {
  display: inline-flex;
  align-items: center;
  gap: var(--orca-spacing-xs);
  align-self: flex-start;
  padding: var(--orca-spacing-xs) var(--orca-spacing-sm);
  border: none;
  border-radius: var(--orca-radius-sm);
  background: none;
  color: var(--orca-color-text-2);
  font: inherit;
  cursor: pointer;
}

.nextaction-done-section-toggle:hover,
.nextaction-done-section-earlier:hover {
  background-color: var(--orca-color-bg-2);
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
