// Dragging a task card out of the plugin panel (#122, ui/drag/card-drag.tsx).
// Only Orca's theme variables; verified by hand in Orca (docs/ARCHITECTURE.md §5).
export const cardDragCss = `
/*
 * A press anywhere on a draggable card starts a drag: its text is not
 * selectable; the task panel shows the text to copy.
 */
[data-nextaction-card-drag],
[data-nextaction-card-drag] .nextaction-task-card-text {
  user-select: none;
}

/* The card being dragged stays in place, faded. */
[data-nextaction-card-drag-source] {
  opacity: 0.4;
}

/* While dragging: a grabbing cursor, and no text selected anywhere. */
:root[data-nextaction-card-dragging],
:root[data-nextaction-card-dragging] * {
  cursor: grabbing !important;
  user-select: none !important;
}

/* A card's edge changes a length (My Day's timeline, #85). */
:root[data-nextaction-card-dragging="resize"],
:root[data-nextaction-card-dragging="resize"] * {
  cursor: ns-resize !important;
}

.nextaction-card-drag-chip {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 10000;
  max-width: 240px;
  padding: var(--orca-spacing-xs) var(--orca-spacing-sm);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--orca-fontsize-sm);
  color: var(--orca-color-text-1);
  background-color: var(--orca-color-bg-1);
  border: var(--orca-border-box);
  border-radius: var(--orca-radius-sm);
  box-shadow: var(--orca-shadow-popup);
  pointer-events: none;
}

/* Hidden where the view shows the drag itself (My Day's timeline preview). */
.nextaction-card-drag-chip[hidden] {
  display: none;
}

/* Where the new block would go in the note panel: Orca draws nothing (drag-to-note). */
.nextaction-note-drop-line {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  height: 2px;
  border-radius: 1px;
  background-color: var(--orca-color-primary-5);
  pointer-events: none;
}

.nextaction-note-drop-line[hidden] {
  display: none;
}

/* Where an inline reference would go in the text (#125). */
.nextaction-note-drop-caret {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background-color: var(--orca-color-primary-5);
  pointer-events: none;
}

.nextaction-note-drop-caret[hidden] {
  display: none;
}
`;
