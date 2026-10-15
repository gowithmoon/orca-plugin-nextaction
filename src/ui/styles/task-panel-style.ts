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
// Ratings fill their row up to one width, so a wide panel does not stretch
// them and a narrow window leaves no gap to their right. The fields that read
// like inputs (dates, repeat, reminders, review) fill the row, ending where
// context, label and note do.

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

/* Custom properties (#113): their own group after the built-in fields. */
.nextaction-custom-properties {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
  padding-top: var(--orca-spacing-md);
  border-top: 1px solid var(--orca-color-border);
}

.nextaction-custom-properties-heading {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
  font-weight: 600;
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

/*
 * Why not a next action (#54, #78): read only, one line per reason, a bullet
 * each when there are several; task names are links. Text the size of the
 * Orca controls in the other rows (sm).
 */
.nextaction-not-next-action-reasons {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--orca-fontsize-sm);
}

.nextaction-not-next-action-reason {
  position: relative;
  overflow-wrap: anywhere;
  line-height: var(--orca-lineheight-md);
}

.nextaction-not-next-action-reasons[data-several] > .nextaction-not-next-action-reason {
  padding-inline-start: 1em;
}

.nextaction-not-next-action-reasons[data-several] > .nextaction-not-next-action-reason::before {
  content: "•";
  position: absolute;
  inset-inline-start: 0;
  color: var(--orca-color-text-2);
}

.nextaction-not-next-action-reason-kind {
  color: var(--orca-color-text-2);
}

.nextaction-not-next-action-reason-task {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--orca-color-primary-5);
  text-align: start;
  cursor: pointer;
}

.nextaction-not-next-action-reason-task:hover {
  text-decoration: underline;
}

.nextaction-not-next-action-reason-task[data-empty] {
  font-style: italic;
}

/* A recurring task not advanced (GLOSSARY: 未自动重复, #93): a warning line with its fix. */
.nextaction-not-advanced {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  border-radius: var(--orca-radius-md);
  background-color: color-mix(in srgb, var(--orca-color-text-yellow) 12%, transparent);
  color: var(--orca-color-text-yellow);
}

.nextaction-not-advanced-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.nextaction-sequential-field {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
}

/* Dependency delay (#77): a short number input, the unit and hint beside it. */
.nextaction-delay-field {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
}

.nextaction-delay-field > :first-child {
  flex: 0 0 6em;
  min-width: 0;
}

/* The size of the Orca control beside them (sm). */
.nextaction-delay-hint,
.nextaction-sequential-hint {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-block-refs-field {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
}

/* One compact line per block, in the size of the Orca controls around (sm). */
.nextaction-block-refs {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--orca-fontsize-sm);
}

.nextaction-block-ref {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  line-height: var(--orca-lineheight-sm);
}

/* Scoped to the row so it outweighs the padding of Orca's plain Button. */
.nextaction-block-ref .nextaction-block-ref-remove {
  flex: 0 0 auto;
  min-height: 0;
  height: auto;
  padding: calc(var(--orca-spacing-xs) / 2) var(--orca-spacing-xs);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-block-ref-target {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--orca-color-primary-5);
  text-align: start;
  overflow-wrap: anywhere;
  cursor: pointer;
}

span.nextaction-block-ref-target {
  color: var(--orca-color-text-2);
  cursor: default;
}

button.nextaction-block-ref-target:hover {
  text-decoration: underline;
}

.nextaction-block-ref-target[data-empty] {
  font-style: italic;
}

.nextaction-block-ref[data-struck] .nextaction-block-ref-target {
  text-decoration: line-through;
  color: var(--orca-color-text-2);
}

.nextaction-dependency-recurring,
.nextaction-not-next-action-reason-recurring {
  margin-inline-start: var(--orca-spacing-xs);
  color: var(--orca-color-text-2);
}

/* Recurring tasks (#94, ADR 0021): why the dependency or order stays unmet. */
.nextaction-dependency-hint,
.nextaction-not-next-action-reason-hint {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-dependency-stale {
  flex: 0 0 auto;
  color: var(--orca-color-text-2);
}

/* 所属项目 (#146): the project status icon before the name, the source after. */
.nextaction-project-of-task-icon {
  flex: 0 0 auto;
}

.nextaction-project-of-task-source {
  flex: 0 1 auto;
  min-width: 0;
  color: var(--orca-color-text-2);
  overflow-wrap: anywhere;
}

/* The project name takes only its own width, so the source follows it. */
.nextaction-block-ref:has(.nextaction-project-of-task-source)
  .nextaction-block-ref-target {
  flex: 0 1 auto;
}

.nextaction-project-of-task-parent {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--orca-color-primary-5);
  cursor: pointer;
}

.nextaction-project-of-task-parent:hover {
  text-decoration: underline;
}

.nextaction-project-of-task-parent[data-empty] {
  font-style: italic;
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

/* Repeat (#95): the rule's summary as a button reading like a field. */
.nextaction-recurrence-field {
  display: flex;
  align-items: center;
  min-width: 0;
}

.nextaction-recurrence-field .nextaction-recurrence-button {
  flex: 1 1 auto;
  justify-content: flex-start;
  gap: var(--orca-spacing-sm);
  min-width: 0;
  padding: var(--orca-spacing-sm) var(--orca-spacing-md);
  font-weight: var(--orca-fontweight-md);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nextaction-recurrence-button > .ti {
  color: var(--orca-color-text-2);
}

.nextaction-recurrence-field .nextaction-recurrence-button[data-empty] {
  color: var(--orca-color-placeholder, var(--orca-color-text-2));
}

.nextaction-recurrence-field .nextaction-recurrence-button[data-unreadable] {
  color: var(--orca-color-dangerous-5);
}

/* Review (#103): the plan's summary as a button reading like a field, as
   Repeat's; "Mark reviewed" as an icon beside it. */
.nextaction-review-field {
  gap: var(--orca-spacing-xs);
}

.nextaction-review-field > :not(.nextaction-recurrence-button) {
  flex: 0 0 auto;
}

/* The review popup (review-popup.tsx), in the recurrence popup's look: the
   "every" and the number (shown only with a unit), then the units with
   "none" first. The number is picked by place, as the recurrence popup's. */
.nextaction-review-popup-interval {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-sm);
}

.nextaction-review-popup-interval > :nth-child(2):not(:last-child) {
  width: 5rem;
}

/* The reminder popup (reminder-popup.tsx), in the recurrence popup's look:
   the list, one reminder a row (passed ones greyed), the quick options
   wrapping, the custom moment with "Add" beside it. */
.nextaction-reminder-list {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.nextaction-reminder-item,
.nextaction-reminder-custom {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
  min-width: 0;
}

.nextaction-reminder-moment {
  display: inline-flex;
  min-width: 0;
}

.nextaction-reminder-moment-button {
  gap: var(--orca-spacing-sm);
  white-space: nowrap;
}

.nextaction-reminder-moment-button > .ti {
  color: var(--orca-color-text-2);
}

.nextaction-reminder-item[data-passed] .nextaction-reminder-moment-button,
.nextaction-reminder-passed {
  color: var(--orca-color-text-2);
  opacity: 0.7;
}

.nextaction-reminder-passed {
  font-size: var(--orca-fontsize-xs);
}

.nextaction-reminder-item > :last-child {
  margin-left: auto;
}

/* The quick options: toggles in a two-column grid of fixed cells, so
   choosing one changes neither its size nor anything around it. */
.nextaction-reminder-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--orca-spacing-xs);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.nextaction-reminder-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--orca-spacing-xs);
  min-width: 0;
  padding: var(--orca-spacing-xs) var(--orca-spacing-sm);
  border: 1px solid color-mix(in srgb, var(--orca-color-border) 60%, transparent);
  border-radius: var(--orca-radius-md);
  background-color: transparent;
  color: var(--orca-color-text-2);
  font: inherit;
  font-size: var(--orca-fontsize-sm);
  white-space: nowrap;
  cursor: pointer;
}

.nextaction-reminder-option:hover:not(:disabled) {
  background-color: var(--orca-color-bg-2);
}

.nextaction-reminder-option[data-chosen] {
  border-color: var(--orca-color-primary-5);
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 12%, var(--orca-color-bg-1));
  color: var(--orca-color-text-1);
}

.nextaction-reminder-option:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Its room is kept while not chosen, so the text does not shift. */
.nextaction-reminder-option-check {
  visibility: hidden;
}

.nextaction-reminder-option[data-chosen] .nextaction-reminder-option-check {
  visibility: visible;
}

/* The recurrence rule popup (recurrence-popup.tsx), in the shared window look. */
.nextaction-recurrence-popup {
  --nextaction-window-width: 26rem;
}

.nextaction-recurrence-popup-body {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-md);
  padding: var(--orca-spacing-md) var(--orca-spacing-lg) var(--orca-spacing-lg);
  overflow-y: auto;
}

.nextaction-recurrence-popup-field {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
  min-width: 0;
}

.nextaction-recurrence-popup-period {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-sm);
}

.nextaction-recurrence-popup-period > :first-child {
  width: 5rem;
}

.nextaction-recurrence-popup-label {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-sm);
}

.nextaction-recurrence-popup-hint {
  color: var(--orca-color-text-2);
  font-size: var(--orca-fontsize-xs);
}

/* Pause (#92): the switch, what it does beside it. */
.nextaction-recurrence-popup-pause {
  display: flex;
  align-items: center;
  gap: var(--orca-spacing-sm);
}

.nextaction-recurrence-popup-warning {
  color: var(--orca-color-dangerous-5);
  font-size: var(--orca-fontsize-sm);
}

/* The days of a weekly placement (#88): seven toggles in a row. */
.nextaction-recurrence-popup-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--orca-spacing-xs);
  margin: 0;
  padding: 0;
  border: none;
}

.nextaction-recurrence-popup-day {
  padding: var(--orca-spacing-xs) 0;
  border: 1px solid color-mix(in srgb, var(--orca-color-border) 60%, transparent);
  border-radius: var(--orca-radius-md);
  background-color: transparent;
  color: var(--orca-color-text-2);
  font: inherit;
  font-size: var(--orca-fontsize-sm);
  cursor: pointer;
}

.nextaction-recurrence-popup-day:hover {
  background-color: var(--orca-color-bg-2);
}

.nextaction-recurrence-popup-day[data-chosen] {
  border-color: var(--orca-color-primary-5);
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 12%, var(--orca-color-bg-1));
  color: var(--orca-color-text-1);
  font-weight: var(--orca-fontweight-lg);
}

/* The days of a monthly placement: 1 to 31 in rows of seven, then the last day. */
.nextaction-recurrence-popup-month-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--orca-spacing-xs);
  margin: 0;
  padding: 0;
  border: none;
  font-variant-numeric: tabular-nums;
}

/* After the 31st, the rest of the last row. */
.nextaction-recurrence-popup-month-days > [data-last] {
  grid-column: span 4;
}

/* Rows of a monthly or yearly placement, each with its remove button. */
.nextaction-recurrence-popup-rows {
  display: flex;
  flex-direction: column;
  gap: var(--orca-spacing-xs);
}

.nextaction-recurrence-popup-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--orca-spacing-sm);
}

/* One dropdown of a placement (a day of the month, a month, an ordinal). */
.nextaction-recurrence-popup-choice {
  margin: 0;
  padding: 0;
  border: none;
  min-width: 0;
}

/* The next occurrence of the rule being edited (#88). */
.nextaction-recurrence-popup-preview {
  color: var(--orca-color-text-1);
  font-size: var(--orca-fontsize-sm);
}
`;
