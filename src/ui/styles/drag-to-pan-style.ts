// Dragging empty space to move the gantt chart or the board sideways (#187,
// ui/drag/drag-to-pan.ts). The cursor stays as it is until a press pans.
export const dragToPanCss = `
/* While panning: a grabbing cursor, and no text selected anywhere. */
:root[data-nextaction-panning],
:root[data-nextaction-panning] * {
  cursor: grabbing !important;
  user-select: none !important;
}

/* No scroll snapping while panning (the board); back on letting go. */
[data-nextaction-panned] {
  scroll-snap-type: none !important;
}
`;
