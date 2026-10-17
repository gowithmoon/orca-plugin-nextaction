// Styles of the gantt chart's dependencies (#182), after the prototype
// chosen on 2026-10-17 (step11-project-gantt.html): thin arrows over the
// lanes, under the bars and the tree column; the outside-dependency mark
// just before a bar's head. Orca's CSS variables only.

export const ganttDependenciesCss = `
/* The arrows count on each row being exactly --nextaction-gantt-row high. */
.nextaction-gantt-row {
  box-sizing: border-box;
}

.nextaction-gantt-arrows {
  position: absolute;
  top: 0;
  z-index: 1;
  overflow: visible;
  pointer-events: none;
}

.nextaction-gantt-arrow > path {
  fill: none;
  stroke: var(--orca-color-text-3);
  stroke-width: 1.3;
}

.nextaction-gantt-arrow > path.nextaction-gantt-arrow-head {
  fill: var(--orca-color-text-3);
  stroke: none;
}

.nextaction-gantt-arrow > text {
  font-size: 10px;
  fill: var(--orca-color-text-2);
  paint-order: stroke;
  stroke: var(--orca-color-bg-1);
  stroke-width: 3px;
  stroke-linejoin: round;
}

.nextaction-gantt-outside {
  position: absolute;
  top: 8px;
  z-index: 3;
  width: 14px;
  height: 14px;
  margin-left: -17px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: var(--orca-color-bg-3);
  color: var(--orca-color-text-2);
  font-size: 10px;
  cursor: help;
}
`;
