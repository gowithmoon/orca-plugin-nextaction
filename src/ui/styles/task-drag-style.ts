// Dragging a task onto another task's card (#70) or into a gap between cards
// (#71) in the all tasks view; the card's press, fading and chip are the
// shared card drag's (card-drag-style.ts, #124). Only Orca's theme variables;
// verified by hand in Orca (docs/ARCHITECTURE.md §5).
export const taskDragCss = `
/* A card's wrapper, the card filling it. */
[data-nextaction-drop-task] {
  display: flex;
  min-width: 0;
  border-radius: var(--orca-radius-md);
}

[data-nextaction-drop-task] > .nextaction-task-card,
[data-nextaction-drop-task] > div {
  flex: 1 1 auto;
  min-width: 0;
}

/* The task being dragged stays in place, faded as before (#70). */
[data-nextaction-drop-task][data-nextaction-card-drag-source] {
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
`;
