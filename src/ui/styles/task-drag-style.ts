// Dragging a task onto another task's card in the all tasks view (#70). Only
// Orca's theme variables; verified by hand in Orca (docs/ARCHITECTURE.md §5).
export const taskDragCss = `
/* A card with its drag handle, in a row; the card takes the rest. */
[data-nextaction-drop-task] {
  display: flex;
  align-items: flex-start;
  gap: var(--orca-spacing-xs);
  min-width: 0;
  border-radius: var(--orca-radius-md);
}

[data-nextaction-drop-task] > .nextaction-task-card,
[data-nextaction-drop-task] > div {
  flex: 1 1 auto;
  min-width: 0;
}

.nextaction-drag-handle {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  min-height: 28px;
  color: var(--orca-color-text-2);
  cursor: grab;
  opacity: 0.4;
  touch-action: none;
  user-select: none;
}

[data-nextaction-drop-task]:hover > .nextaction-drag-handle,
.nextaction-drag-handle[data-dragging] {
  opacity: 1;
}

.nextaction-drag-handle[data-dragging] {
  cursor: grabbing;
}

/* The task being dragged stays in place, faded. */
[data-nextaction-drop-task][data-dragging] {
  opacity: 0.5;
}

/* The card it would become a subtask of. */
[data-nextaction-drop-task][data-drop-over] {
  outline: 2px solid var(--orca-color-primary-5);
  outline-offset: 1px;
  background-color: color-mix(in srgb, var(--orca-color-primary-5) 10%, transparent);
}

/* No text gets selected while dragging. */
.nextaction-drag-area:has(.nextaction-drag-handle[data-dragging]) {
  user-select: none;
  cursor: grabbing;
}

.nextaction-drag-preview {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
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
`;
