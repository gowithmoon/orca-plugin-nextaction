// The stats view's completion chart (GLOSSARY: 统计视图, #132): a bar per
// cell of the period, the completions at the bottom and the skips stacked
// above them in a lighter shade. Drawn in SVG at the chart's own width, so
// text keeps its size; each bar has a focusable button over it with a
// readable label and a tooltip. Only Orca's theme variables; verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { StatsCellRead } from "../../../application/usecases/read-stats";

/** The chart's height and margins (px). */
const chart = { height: 168, top: 8, bottom: 24, left: 28, right: 4 };
/** The least room a cell's label takes (px); labels are thinned below it. */
const minLabelWidth = 36;
/** The widest a bar gets (px). */
const maxBarWidth = 40;

/**
 * The value axis' ticks for a highest count of `max`: a step of 1, 2 or 5
 * times a power of 10, at most 4 steps, up to at least 4 so a few
 * completions do not fill the chart.
 */
function valueTicks(max: number): readonly number[] {
  const top = Math.max(max, 4);
  let step = 1;
  for (let scale = 1; ; scale *= 10) {
    const found = [1, 2, 5].find((base) => top / (base * scale) <= 4);
    if (found !== undefined) {
      step = found * scale;
      break;
    }
  }
  const count = Math.ceil(top / step);
  return Array.from({ length: count + 1 }, (_, index) => index * step);
}

/** Follows the element's width; 0 until it is first measured. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function CompletionChart(props: {
  cells: readonly StatsCellRead[];
  /** The label under a cell, e.g. its weekday. */
  cellLabel: (cell: StatsCellRead) => string;
  /** What a cell's bar reads as, in its tooltip and to a screen reader. */
  cellDescription: (cell: StatsCellRead) => string;
  /** The cell holding today, its label emphasized; none outside the period. */
  isToday: (cell: StatsCellRead) => boolean;
  /** Names the bars as a group, e.g. "Completions by day". */
  label: string;
}) {
  const { cells } = props;
  const { Tooltip } = orca.components;
  const ref = React.useRef<HTMLDivElement>(null);
  const width = useWidth(ref);

  const ticks = valueTicks(
    Math.max(0, ...cells.map((cell) => cell.completions + cell.skips)),
  );
  const top = ticks[ticks.length - 1] ?? 1;
  const plotWidth = Math.max(0, width - chart.left - chart.right);
  const plotHeight = chart.height - chart.top - chart.bottom;
  const band = cells.length > 0 ? plotWidth / cells.length : 0;
  const barWidth = Math.min(band * 0.6, maxBarWidth);
  const labelEvery = Math.max(
    1,
    Math.ceil((cells.length * minLabelWidth) / Math.max(plotWidth, 1)),
  );
  /** The y of a count. */
  const y = (count: number) => chart.top + plotHeight * (1 - count / top);

  return (
    <div ref={ref} className="nextaction-stats-chart">
      {width > 0 && (
        <svg
          width={width}
          height={chart.height}
          viewBox={`0 0 ${width} ${chart.height}`}
          aria-hidden="true"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="nextaction-stats-grid"
                x1={chart.left}
                x2={chart.left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="nextaction-stats-axis-text"
                x={chart.left - 6}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {tick}
              </text>
            </g>
          ))}
          {cells.map((cell, index) => {
            const x = chart.left + band * index + (band - barWidth) / 2;
            const completed = cell.completions;
            const total = completed + cell.skips;
            return (
              <g
                key={`${cell.first.year}-${cell.first.month}-${cell.first.day}`}
              >
                {completed > 0 && (
                  <rect
                    className="nextaction-stats-bar-completions"
                    x={x}
                    width={barWidth}
                    y={y(completed)}
                    height={y(0) - y(completed)}
                  />
                )}
                {cell.skips > 0 && (
                  <rect
                    className="nextaction-stats-bar-skips"
                    x={x}
                    width={barWidth}
                    y={y(total)}
                    height={y(completed) - y(total)}
                  />
                )}
                {index % labelEvery === 0 && (
                  <text
                    className={
                      props.isToday(cell)
                        ? "nextaction-stats-axis-text nextaction-stats-axis-today"
                        : "nextaction-stats-axis-text"
                    }
                    x={chart.left + band * index + band / 2}
                    y={chart.height - chart.bottom / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {props.cellLabel(cell)}
                  </text>
                )}
              </g>
            );
          })}
          <line
            className="nextaction-stats-baseline"
            x1={chart.left}
            x2={chart.left + plotWidth}
            y1={y(0)}
            y2={y(0)}
          />
        </svg>
      )}
      <fieldset
        className="nextaction-stats-bars"
        aria-label={props.label}
        style={{ left: chart.left, top: chart.top, height: plotHeight }}
      >
        {cells.map((cell, index) => {
          const description = props.cellDescription(cell);
          return (
            <Tooltip
              key={`${cell.first.year}-${cell.first.month}-${cell.first.day}`}
              text={description}
              defaultPlacement="top"
            >
              <button
                type="button"
                className="nextaction-stats-bar-hit"
                aria-label={description}
                style={{ left: band * index, width: band }}
              />
            </Tooltip>
          );
        })}
      </fieldset>
    </div>
  );
}
