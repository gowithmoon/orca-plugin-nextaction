// Dragging a task onto another task's card (#70) or into a gap between cards
// (#71) in the all tasks view. Only Orca's theme variables; verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
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

/*
 * A gap covers the space between a list item and the one above it (the
 * lists' gap), reaching a little into the cards on either side so it is easy
 * to hit; the one after the last top-level task, the space below it.
 */
.nextaction-task-tree li {
  position: relative;
}

.nextaction-drop-gap {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(-1 * var(--orca-spacing-md) - 3px);
  z-index: 1;
  height: calc(var(--orca-spacing-md) + 6px);
  pointer-events: none;
}

.nextaction-drop-gap[data-placement="after"] {
  top: calc(100% - 3px);
}

.nextaction-drag-area[data-dragging] .nextaction-drop-gap {
  pointer-events: auto;
}

/* Where it would go: a line in the middle of the gap. */
.nextaction-drop-gap[data-drop-over]::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
  border-radius: 1px;
  background-color: var(--orca-color-primary-5);
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
