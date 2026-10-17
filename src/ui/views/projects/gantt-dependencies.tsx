// The gantt chart's dependencies (GLOSSARY: 依赖, #182): an arrow from the
// end of the depended-on task's bar to the start of the waiting task's,
// "+N天" on it for a dependency delay; a dependency on a task outside the
// project is only a mark at the head of the bar, naming the task on hover.
// A date conflict (GLOSSARY: 日期冲突, #183) turns its arrows red and puts a
// red triangle at the head of the waiting task's bar, wherever it was made.
// An arrow one of whose ends draws no bar (an unplaced task, a row hidden
// below a collapsed one) is left out. Doing subtasks one after another
// (GLOSSARY: 顺序执行) draws none: the rows' order tells. Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import type {
  GanttDependency,
  GanttRow,
} from "../../../application/usecases/read-project-gantt";
import type { TaskId } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { shownText } from "../../components/format";
import type { GanttAxis } from "./gantt-axis";

/** A row's height in pixels: `--nextaction-gantt-row`. */
const rowHeight = 30;

/** Where a bar sits in the rows' box, in pixels. */
interface BarPlace {
  readonly left: number;
  readonly right: number;
  /** Its middle, up and down. */
  readonly y: number;
}

/** The bars of the rows shown, by task; as `BarView` draws them. */
function barPlaces(
  rows: readonly GanttRow[],
  axis: GanttAxis,
): Map<TaskId, BarPlace> {
  const places = new Map<TaskId, BarPlace>();
  rows.forEach((row, index) => {
    if (row.bar?.kind !== "bar") return;
    const left = axis.x(row.bar.start);
    places.set(row.task.id, {
      left,
      right: left + Math.max(axis.endX(row.bar.due) - left, 6),
      y: index * rowHeight + rowHeight / 2,
    });
  });
  return places;
}

/**
 * The arrow's line: out of `from`'s end, down or up, into `to`'s start.
 * When `to` starts too close after (or before) `from`'s end, it goes round
 * through the gap between the rows.
 */
function arrowPath(from: BarPlace, to: BarPlace): string {
  const x1 = from.right;
  const x2 = to.left;
  if (x2 - x1 >= 14) {
    return `M${x1} ${from.y}H${x1 + 7}V${to.y}H${x2 - 1}`;
  }
  const between = to.y + (to.y > from.y ? -1 : 1) * (rowHeight / 2);
  return `M${x1} ${from.y}H${x1 + 7}V${between}H${x2 - 9}V${to.y}H${x2 - 1}`;
}

/** One arrow, its head at `to`'s start; "+N天" above it for a delay. */
function Arrow(props: {
  dependency: GanttDependency;
  from: BarPlace;
  to: BarPlace;
}) {
  const { dependency, from, to } = props;
  const x = to.left - 1;
  return (
    <g
      className="nextaction-gantt-arrow"
      data-conflict={dependency.conflict || undefined}
    >
      <path d={arrowPath(from, to)} />
      <path
        className="nextaction-gantt-arrow-head"
        d={`M${x} ${to.y}l-6 -3.5v7z`}
      />
      {dependency.delay > 0 && (
        <text x={to.left - 5} y={to.y - 6} textAnchor="end">
          {t("+${days}d", { days: String(dependency.delay) })}
        </text>
      )}
    </g>
  );
}

/**
 * The arrows of the rows shown, laid over the lanes (`left` is where the
 * time axis starts in the rows' box).
 */
export function GanttDependencyArrows(props: {
  rows: readonly GanttRow[];
  axis: GanttAxis;
  left: number;
}) {
  const { rows, axis } = props;
  const places = barPlaces(rows, axis);
  const arrows = rows.flatMap((row) =>
    row.dependencies.flatMap((dependency) => {
      const from = places.get(dependency.from);
      const to = places.get(dependency.to);
      return from && to ? [{ dependency, from, to }] : [];
    }),
  );
  // The red ones last, so that no grey line covers them.
  arrows.sort(
    (a, b) => Number(a.dependency.conflict) - Number(b.dependency.conflict),
  );
  if (arrows.length === 0) return null;
  return (
    <svg
      className="nextaction-gantt-arrows"
      style={{ left: props.left }}
      width={axis.width}
      height={rows.length * rowHeight}
      aria-hidden="true"
    >
      {arrows.map(({ dependency, from, to }) => (
        <Arrow
          key={`${dependency.from}>${dependency.to}`}
          dependency={dependency}
          from={from}
          to={to}
        />
      ))}
    </svg>
  );
}

/**
 * The mark at the head of a row's bar for its dependencies on tasks outside
 * the project, naming them on hover; none: nothing.
 */
export function GanttOutsideDependencyMark(props: {
  row: GanttRow;
  axis: GanttAxis;
}) {
  const { row, axis } = props;
  if (row.bar?.kind !== "bar" || row.outsideDependencies.length === 0) {
    return null;
  }
  const label = t("Depends on tasks outside the project: ${tasks}", {
    tasks: row.outsideDependencies
      .map((dependency) => shownText(dependency).text)
      .join(t(", ")),
  });
  return (
    <span
      className="nextaction-gantt-outside"
      role="img"
      style={{ left: axis.x(row.bar.start) }}
      title={label}
      aria-label={label}
    >
      <i className="ti ti-link" aria-hidden="true" />
    </span>
  );
}

/**
 * The red triangle at the head of a row's bar when its task has a date
 * conflict (#183); none: nothing.
 */
export function GanttConflictMark(props: { row: GanttRow; axis: GanttAxis }) {
  const { row, axis } = props;
  if (
    row.bar?.kind !== "bar" ||
    !row.dependencies.some((dependency) => dependency.conflict)
  ) {
    return null;
  }
  const label = t("Date conflict: starts before a task it depends on is due");
  return (
    <span
      className="nextaction-gantt-conflict"
      role="img"
      style={{ left: axis.x(row.bar.start) }}
      title={label}
      aria-label={label}
    />
  );
}
