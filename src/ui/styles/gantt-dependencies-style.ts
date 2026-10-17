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

/* A date conflict (#183): red arrows, a red triangle at the bar's head. */
.nextaction-gantt-arrow[data-conflict] > path {
  stroke: var(--orca-color-dangerous-5);
  stroke-width: 1.6;
}

.nextaction-gantt-arrow[data-conflict] > path.nextaction-gantt-arrow-head {
  fill: var(--orca-color-dangerous-5);
}

.nextaction-gantt-arrow[data-conflict] > text {
  fill: var(--orca-color-dangerous-5);
  font-weight: 650;
}

.nextaction-gantt-conflict {
  position: absolute;
  top: 1px;
  z-index: 3;
  width: 0;
  height: 0;
  margin-left: -4px;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 7px solid var(--orca-color-dangerous-5);
  filter: drop-shadow(0 0 1px var(--orca-color-bg-1));
  cursor: help;
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
