// Styles of the task panel form, injected through the registry; its popup
// wears the shared window look (window-style.ts). Orca's CSS variables only;
// class names start with `nextaction-`. Layout follows the panel's own width
// (container queries, #35 "档位与灵活布局"): labels to the left from 420px,
// above the fields below that; status buttons in three columns and two rows
// when very narrow. Header, body and footer space and separate like the
// plugin panel's header and view (#45 "任务属性面板").
//
// The fields also show in the quick capture window, inside a container of its
// own (nextaction-capture-fields); the field layout follows either container.
// The window is narrower, so its labels go to the left sooner and take less
// room (`--nextaction-field-label-width`, quick-capture-style.ts).
//
// Ratings and dates fill their row up to one width, so a wide panel does not
// stretch them and a narrow window leaves no gap to their right.

/** Labels to the left from `minWidth`, for the fields inside `container`. */
const wideFieldsCss = (container: string, minWidth: string) => `
@container ${container} (min-width: ${minWidth}) {
  .nextaction-task-field {
    flex-direction: row;
    align-items: center;
    gap: var(--orca-spacing-md);
  }
  .nextaction-task-field-label {
    flex: 0 0 var(--nextaction-field-label-width, 6rem);
  }
  .nextaction-task-field-control {
    flex: 1 1 auto;
  }
}
`;

export const taskPanelCss = `
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
  flex: 0 0 auto;
  padding: var(--orca-spacing-md) var(--orca-spacing-md) var(--orca-spacing-md) var(--orca-spacing-lg);
  border-bottom: var(--orca-border-separator);
}

/* The header's text and icons, one size up: the task is what the panel is about. */
.nextaction-task-panel-header > .nextaction-status-icon {
  /* One text line high, so the icon sits on the first line. */
  height: calc(var(--orca-fontsize-lg) * var(--orca-lineheight-md));
  align-items: center;
  font-size: var(--orca-fontsize-lg);
}

.nextaction-task-panel-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: var(--orca-fontsize-lg);
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
  padding: var(--orca-spacing-lg);
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

${wideFieldsCss("nextaction-task-panel", "420px")}
${wideFieldsCss("nextaction-capture-fields", "300px")}

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
  padding: var(--orca-spacing-sm) var(--orca-spacing-xs);
  border: 1px solid color-mix(in srgb, var(--orca-color-border) 60%, transparent);
  border-radius: var(--orca-radius-md);
  background-color: transparent;
  color: var(--orca-color-text-2);
  font: inherit;
  font-size: var(--orca-fontsize-xs);
  cursor: pointer;
}

.nextaction-status-button > .ti {
  color: var(--nextaction-status-color);
  font-size: var(--orca-fontsize-lg);
}

.nextaction-status-button:hover {
  background-color: var(--orca-color-bg-2);
}

/* The current status on a faint ground of its own colour. */
.nextaction-status-button[data-current] {
  border-color: var(--nextaction-status-color);
  background-color: color-mix(in srgb, var(--nextaction-status-color) 10%, var(--orca-color-bg-1));
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
  max-width: 18rem;
}

.nextaction-rating-cells {
  display: flex;
  gap: var(--orca-spacing-xs);
  flex: 1 1 auto;
}

/*
 * A seven-step meter: each cell is a full-height target drawing a slim bar,
 * filled up to the chosen level. The bar's 6px height and the default mark's
 * 4px size are the mark's own geometry, not spacing; no Orca variable stands
 * for them.
 */
.nextaction-rating-cell {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  height: 1.25rem;
  padding: 0;
  border: none;
  border-radius: var(--orca-radius-sm);
  background-color: transparent;
  cursor: pointer;
}

.nextaction-rating-cell::before {
  content: "";
  position: absolute;
  inset: 0 1px;
  margin: auto 0;
  height: 6px;
  border-radius: 3px;
  background-color: var(--orca-color-border);
}

.nextaction-rating-cell:hover::before {
  background-color: var(--orca-color-text-3, var(--orca-color-text-2));
}

.nextaction-rating-cell[data-filled]::before {
  background-color: var(--orca-color-primary-5);
  opacity: 0.55;
}

.nextaction-rating-cell[data-current]::before {
  opacity: 1;
}

/* The default level (4) carries a small dot under its bar. */
.nextaction-rating-cell[data-default]::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 0;
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
  /* Level names are mostly two characters wide: the meter keeps its length. */
  min-width: 3em;
  color: var(--orca-color-text-1);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-date-field {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  min-width: 0;
  max-width: 18rem;
}

.nextaction-date-trigger {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
}

/* Reads like a field: the date to the left, the icon muted. */
.nextaction-date-field .nextaction-date-button {
  flex: 1 1 auto;
  justify-content: flex-start;
  gap: var(--orca-spacing-sm);
  min-width: 0;
  padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  font-weight: var(--orca-fontweight-md);
  white-space: nowrap;
}

.nextaction-date-button > .ti {
  color: var(--orca-color-text-2);
}

.nextaction-date-field .nextaction-date-button[data-empty] {
  color: var(--orca-color-placeholder, var(--orca-color-text-2));
}

.nextaction-date-field .nextaction-date-button[data-overdue],
.nextaction-date-button[data-overdue] > .ti {
  color: var(--orca-color-dangerous-5);
}

.nextaction-date-field > .nextaction-property-overdue {
  flex: 0 0 auto;
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

/* Blocking reasons (#54): read only, one line per kind; task names are links. */
.nextaction-blocking-reasons {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.nextaction-blocking-reason {
  overflow-wrap: anywhere;
  line-height: var(--orca-lineheight-md);
}

.nextaction-blocking-reason-kind {
  color: var(--orca-color-text-2);
}

.nextaction-blocking-reason-task {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--orca-color-primary-5);
  text-align: start;
  cursor: pointer;
}

.nextaction-blocking-reason-task:hover {
  text-decoration: underline;
}

.nextaction-blocking-reason-task[data-empty] {
  font-style: italic;
}

.nextaction-sequential-field {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
}

.nextaction-sequential-hint {
  color: var(--orca-color-text-2);
}

.nextaction-task-panel-footer {
  display: flex;
  justify-content: flex-end;
  flex: 0 0 auto;
  padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  border-top: var(--orca-border-separator);
}

/* The window's footer sits on a slightly darker ground, as quick capture's. */
.nextaction-window .nextaction-task-panel-footer {
  background-color: var(--orca-color-bg-2);
}

/* The least used action: a trash icon, grey until pointed at (#45 "任务属性面板"). */
/* Scoped to the footer so it outweighs the colours of Orca's plain Button. */
.nextaction-task-panel-footer .nextaction-task-drop {
  color: var(--orca-color-text-2);
}

.nextaction-task-panel-footer .nextaction-task-drop:hover,
.nextaction-task-panel-footer .nextaction-task-drop:focus-visible {
  background-color: color-mix(in srgb, var(--orca-color-dangerous-5) 10%, transparent);
  color: var(--orca-color-dangerous-5);
}
`;
