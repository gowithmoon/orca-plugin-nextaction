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

/*
 * The loading placeholder's bars (ui/components/loading-placeholder.tsx):
 * tinted from the text colour, so they suit a dark theme too; Orca's
 * Skeleton paints a fixed light grey.
 */
.nextaction-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-sm);
}

.nextaction-skeleton-title,
.nextaction-skeleton-text {
  height: var(--orca-height-skeleton, 1rem);
  border-radius: var(--orca-radius-md);
  background-color: color-mix(in srgb, var(--orca-color-text-2) 15%, transparent);
  animation: nextaction-breathe 1s ease-in-out alternate infinite;
}

.nextaction-skeleton-title {
  width: 40%;
}

@keyframes nextaction-breathe {
  to {
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nextaction-skeleton-title,
  .nextaction-skeleton-text {
    animation: none;
  }
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

/*
 * Its parts (#149): the project (status icon and name), then the parent
 * task, each cut short on its own when the line is too narrow for both.
 */
.nextaction-task-card-project,
.nextaction-task-card-parent-task {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-xs);
  flex: 0 1 auto;
  min-width: 0;
}

.nextaction-task-card-parent .ti {
  flex: 0 0 auto;
}

.nextaction-task-card-parent-sep {
  flex: 0 0 auto;
  opacity: 0.6;
}

.nextaction-task-card-parent-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nextaction-task-card-parent [data-empty] .nextaction-task-card-parent-text {
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
 * The all tasks view's toolbar (#69), one row: the search box, then the
 * view controls (sort, direction, collapse or expand all, the filter
 * button) at the far end. The search box stops growing at a width that
 * reads well; in a really narrow view it wraps above the controls.
 */
.nextaction-toolbar {
  /* The filter panel hangs from it. */
  position: relative;
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
  flex: 0 1 auto;
  min-width: 0;
  margin-inline-start: auto;
}

/* Controls at the end of a view's title row (the next action view's filter). */
.nextaction-view-header-actions {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-xs);
  margin-inline-start: auto;
  /* As tall as the title, not taller: the row keeps its height. */
  margin-block: calc(var(--orca-spacing-xs) * -1);
  align-self: center;
}

/*
 * The filter button (filter-panel.tsx). While something is chosen it is
 * tinted in the primary colour and counts the fields holding a choice.
 */
.nextaction-filter-anchor {
  display: inline-flex;
  flex: 0 0 auto;
}

.nextaction-filter-button {
  gap: var(--orca-spacing-xs);
}

.nextaction-filter-button[data-active],
.nextaction-filter-button[data-active]:hover {
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 12%, transparent);
  color: var(--orca-color-primary-5);
}

.nextaction-filter-badge {
  min-width: 1.5em;
  padding: 0 var(--orca-spacing-xs);
  border-radius: 0.75em;
  background-color: var(--orca-color-primary-5);
  color: var(--orca-color-bg-1);
  font-size: var(--orca-fontsize-xs);
  font-weight: var(--orca-fontweight-lg);
  line-height: 1.5;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/*
 * The filter panel: over the list, below the row its button ends (the
 * toolbar, or the view's title row), its right edge on the row's and never
 * wider than it. It scrolls with the row.
 */
.nextaction-filter-panel {
  position: absolute;
  z-index: 21;
  top: 100%;
  right: 0;
  width: min(20em, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-sm);
  margin: var(--orca-spacing-xs) 0 0;
  padding: var(--orca-spacing-md);
  /* The windows' border; --orca-border-box is what the focus outlines use. */
  border: 1px solid var(--orca-color-border);
  border-radius: var(--orca-radius-md);
  background-color: var(--orca-color-bg-1);
  box-shadow: var(--orca-shadow-popup);
}

/* Behind the open panel, over the rest of the plugin panel: a press closes it. */
.nextaction-filter-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
}

.nextaction-filter {
  display: grid;
  grid-template-columns: minmax(3.5em, auto) minmax(0, 1fr);
  align-items: center;
  gap: var(--orca-spacing-md);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.nextaction-filter-label {
  color: var(--orca-color-text-2);
  white-space: nowrap;
}

.nextaction-filter-panel-foot {
  display: flex;
  justify-content: flex-end;
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
/* A recurring task (#95): only the icon, muted; the rule on hover. */
.nextaction-property-recurrence {
  color: var(--orca-color-text-2);
}

/* Paused (#92): the crossed-out icon, fainter. */
.nextaction-property-recurrence[data-paused] {
  opacity: 0.55;
}

/* A reminder still to come (#107): only the bell, muted, as the recurrence icon. */
.nextaction-property-reminder {
  color: var(--orca-color-text-2);
}

/* A recurring task not advanced (GLOSSARY: 未自动重复, #93): a warning, like an unknown status. */
.nextaction-property-not-advanced {
  color: var(--orca-color-text-yellow);
}

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
 * The project row (GLOSSARY: 项目行, #147): a heading over its tasks, no card
 * border. The status icon, the name in bold and the progress on one line, a
 * thin progress bar under them, then what needs noticing, all indented to
 * the name.
 */
.nextaction-project-tree-row > .nextaction-task-tree-toggle {
  margin-top: var(--orca-spacing-xs);
}

.nextaction-project-row {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  min-width: 0;
  padding: var(--orca-spacing-xs) var(--orca-spacing-sm) var(--orca-spacing-sm) 2px;
  border-radius: var(--orca-radius-sm);
  cursor: pointer;
}

.nextaction-project-row:hover {
  background-color: var(--orca-color-bg-2);
}

.nextaction-project-row[data-faded] {
  opacity: 0.6;
  cursor: default;
}

.nextaction-project-row-line {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  min-width: 0;
}

.nextaction-project-row-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  font-size: var(--orca-fontsize-lg);
}

.nextaction-project-row-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--orca-fontweight-lg);
  user-select: text;
}

.nextaction-project-row-progress-value {
  flex: 0 0 auto;
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  font-variant-numeric: tabular-nums;
}

.nextaction-project-row-bar {
  height: 3px;
  margin-left: calc(22px + var(--orca-spacing-sm));
  border-radius: 2px;
  background-color: var(--orca-color-bg-3);
  overflow: hidden;
}

.nextaction-project-row-bar > i {
  display: block;
  height: 100%;
  background-color: var(--orca-color-primary-5);
}

.nextaction-project-row-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-xs) var(--orca-spacing-lg);
  min-width: 0;
  padding-left: calc(22px + var(--orca-spacing-sm));
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
}

/* "No next action", "N tasks not done yet": a yellow mark. */
.nextaction-project-warn {
  padding: 0 var(--orca-spacing-xs);
  border-radius: var(--orca-radius-sm);
  background-color: color-mix(in srgb, var(--orca-color-text-yellow) 14%, transparent);
  color: var(--orca-color-text-yellow);
  font-weight: var(--orca-fontweight-lg);
}

@media (hover: hover) {
  .nextaction-project-row:not(:hover, :focus-within)
    :is(.nextaction-task-card-open, .nextaction-task-card-extra) {
    opacity: 0;
  }
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

/*
 * The project list's groups (#155), as the done section's title: a quiet
 * toggle with the status and its count, then the project rows.
 */
.nextaction-project-groups {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
}

.nextaction-project-group {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
}

.nextaction-project-group-toggle {
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
  font-weight: 600;
  cursor: pointer;
}

.nextaction-project-group-toggle:hover {
  background-color: var(--orca-color-bg-2);
}

.nextaction-project-group-count {
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

/*
 * A project kept in the review's projects step after it left it (#161),
 * faded like a kept task card until another step opens.
 */
.nextaction-project-group-item[data-kept] {
  opacity: 0.6;
}

.nextaction-project-group-list {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* The project details' "‹ Projects" button (#156). */
.nextaction-project-back {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  align-self: flex-start;
  height: 24px;
  margin-bottom: var(--orca-spacing-sm);
  padding: 0 var(--orca-spacing-sm) 0 2px;
  border: none;
  border-radius: var(--orca-radius-sm);
  background: none;
  color: var(--orca-color-text-2);
  font: inherit;
  font-size: var(--orca-fontsize-sm);
  cursor: pointer;
}

.nextaction-project-back:hover {
  background-color: var(--orca-color-bg-2);
  color: var(--orca-color-text-1);
}

/*
 * The project details' attribute area (#156, the prototype's variant C): a
 * line with the status icon, the name and the progress, a line of chips, the
 * goal folded to one line, and the progress bar on the bottom edge. From a
 * roomy width the chips sit beside the first line.
 */
.nextaction-project-attr {
  container: nextaction-project-attr / inline-size;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-bottom: var(--orca-spacing-md);
  padding-bottom: 7px;
}

.nextaction-project-attr-top {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.nextaction-project-attr-line {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  min-width: 0;
}

.nextaction-project-attr-name {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: var(--orca-fontweight-lg);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.nextaction-project-attr-name:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.nextaction-project-attr-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px var(--orca-spacing-lg);
  min-width: 0;
  padding-left: calc(22px + var(--orca-spacing-sm));
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
  line-height: var(--orca-lineheight-sm);
}

.nextaction-project-attr-goal {
  display: flex;
  align-items: baseline;
  gap: var(--orca-spacing-sm);
  width: 100%;
  margin-top: 3px;
  padding: 0 0 0 calc(22px + var(--orca-spacing-sm));
  border: none;
  background: none;
  color: var(--orca-color-text-2);
  font: inherit;
  font-size: var(--orca-fontsize-xs);
  text-align: left;
  cursor: pointer;
}

.nextaction-project-attr-goal-label {
  flex: none;
}

.nextaction-project-attr-goal-text {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--orca-color-text-1);
}

.nextaction-project-attr-goal[aria-expanded="true"] .nextaction-project-attr-goal-text {
  white-space: normal;
  overflow-wrap: anywhere;
}

.nextaction-project-attr-goal > i {
  flex: none;
  align-self: center;
}

.nextaction-project-attr-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background-color: color-mix(in srgb, var(--orca-color-border) 70%, transparent);
}

.nextaction-project-attr-bar > i {
  display: block;
  height: 100%;
  background-color: var(--orca-color-primary-5);
}

@container nextaction-project-attr (min-width: 560px) {
  .nextaction-project-attr-top {
    flex-direction: row;
    align-items: center;
    gap: var(--orca-spacing-lg);
  }
  .nextaction-project-attr-line {
    flex: 0 1 auto;
  }
  .nextaction-project-attr-chips {
    padding-left: 0;
  }
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
