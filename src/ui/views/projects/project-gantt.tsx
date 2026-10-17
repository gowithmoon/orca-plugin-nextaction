// The project details' gantt layout (GLOSSARY: 布局, #176, #186): a narrow
// task tree on the left (about 160px, names cut short, the full name on
// hover), the time axis on the right, a bar per row from the task's start
// to its due date. One scroller holds both, so they scroll up and down
// together; the scale row sticks to the top, the tree to the left. Rows keep
// note order; the tree collapses by task, only the project root tasks
// showing by default. A click on a bar or a name opens the task panel.
// The narrow tier (#185) has no tree column: each task's name is written
// beside its bar, every row shows, none indented or collapsible, and the time
// axis scrolls sideways over the whole width.
// Days become pixels only in gantt-axis.ts. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  GanttBar,
  GanttRow,
  ProjectGantt,
  UnplacedBar,
} from "../../../application/usecases/read-project-gantt";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
import { compareDays, dayOfWeek } from "../../../domain/time/calendar-days";
import { t } from "../../../shared/l10n/l10n";
import { formatDate, shownText } from "../../components/format";
import type { MemoryStore } from "../../components/memory-store";
import { StatusIcon } from "../../components/status-icon";
import { statusLabel } from "../../components/status-label";
import { useCardDrag } from "../../drag/card-drag";
import type { WriteTaskDates } from "../../hooks/use-write-task-dates";
import { usePanel } from "../../panel/panel-context";
import { statusIcons } from "../../task-menu/status-icons";
import { createGanttAxis, type GanttAxis, type GanttScale } from "./gantt-axis";
import {
  BarEnds,
  draggedRows,
  GanttBarDragContext,
  type GanttBarDragDeps,
  GanttDragDates,
  type GanttDragged,
  sameDates,
  useBarDrag,
  useBarDragging,
} from "./gantt-bar-drag";
import {
  GanttConflictMark,
  GanttDependencyArrows,
  GanttOutsideDependencyMark,
} from "./gantt-dependencies";
import type { IdSetStore } from "./project-board-stores";

/** The tree column's width in the wide tier, in pixels. */
const treeWidth = 160;

/** What the chart's rows need. */
export interface GanttCards {
  readonly today: CalendarDate;
  readonly selectedTaskId: TaskId | undefined;
  readonly selectTask: (id: TaskId) => void;
  /** The tasks whose subtasks show; collapsed by default. */
  readonly expanded: IdSetStore<TaskId>;
  /** The unplaced tasks' section is collapsed (#177). */
  readonly unplacedCollapsed: MemoryStore<boolean>;
  /** A bar let go writes its task's two dates, in one undo (#180). */
  readonly writeDates: WriteTaskDates;
}

/** The tasks with a row below them in the read: those that can collapse. */
function parentsOf(rows: readonly GanttRow[]): ReadonlySet<TaskId> {
  return new Set(
    rows.flatMap((row) => (row.parentId === null ? [] : [row.parentId])),
  );
}

/**
 * The rows of the task tree: all but the unplaced tasks, which show in their
 * own section below the chart (#177). An unplaced task's subtree is all
 * unplaced, so the rest stay in preorder.
 */
function treeRows(rows: readonly GanttRow[]): GanttRow[] {
  return rows.filter((row) => row.bar.kind !== "unplaced");
}

/**
 * The rows shown: each one whose ancestor rows are all expanded. The read's
 * rows are in preorder, a row's subtree right after it.
 */
export function shownRows(
  rows: readonly GanttRow[],
  expanded: ReadonlySet<TaskId>,
): GanttRow[] {
  const shown: GanttRow[] = [];
  // Deeper than this is hidden below a collapsed row; none while Infinity.
  let hiddenBelow = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (row.depth > hiddenBelow) continue;
    hiddenBelow = Number.POSITIVE_INFINITY;
    shown.push(row);
    if (!expanded.has(row.task.id)) hiddenBelow = row.depth;
  }
  return shown;
}

/** The month a day starts, as "2026年10月". */
function monthLabel(date: CalendarDate): string {
  return t("${year}/${month}", {
    year: String(date.year),
    month: String(date.month),
  });
}

/** The week a Monday starts, as "10月5日". */
function weekLabel(date: CalendarDate): string {
  return t("${month}/${day}", {
    month: String(date.month),
    day: String(date.day),
  });
}

/**
 * The scale row's two lines and the grid (#179): the days each upper and
 * each lower label starts, and its text. The upper line is the months (the
 * years on the month scale); the lower one the days, the weeks or the
 * months. The grid lines fall where a lower label starts.
 */
const scaleUnits: Record<
  GanttScale,
  {
    upper(day: CalendarDate): boolean;
    upperLabel(day: CalendarDate): string;
    lower(day: CalendarDate): boolean;
    lowerLabel(day: CalendarDate): string;
  }
> = {
  day: {
    upper: (day) => day.day === 1,
    upperLabel: monthLabel,
    lower: () => true,
    lowerLabel: (day) => String(day.day),
  },
  week: {
    upper: (day) => day.day === 1,
    upperLabel: monthLabel,
    lower: (day) => dayOfWeek(day) === 1,
    lowerLabel: weekLabel,
  },
  month: {
    upper: (day) => day.month === 1 && day.day === 1,
    upperLabel: (day) => t("Year ${year}", { year: String(day.year) }),
    lower: (day) => day.day === 1,
    lowerLabel: (day) => t("Month ${month}", { month: String(day.month) }),
  },
};

/** Roughly how wide `text` draws at `size` pixels: CJK characters are square. */
function textWidth(text: string, size: number): number {
  let width = 0;
  for (const char of text) {
    width += /[⺀-鿿＀-￯]/.test(char) ? size : size * 0.6;
  }
  return width;
}

/** The gap kept between two markers, in pixels. */
const markerGap = 4;

/** A marker to place: where it stands, how wide its label draws. */
interface MarkerSpan {
  readonly x: number;
  readonly width: number;
}

/**
 * The markers' centres moved apart so their labels do not overlap (#179):
 * markers that would overlap are laid side by side, the group centred on
 * where they would stand; in the order of `spans`.
 */
function spreadMarkers(spans: readonly MarkerSpan[]): number[] {
  const order = spans
    .map((span, index) => ({ ...span, index }))
    .sort((a, b) => a.x - b.x);
  // Groups of markers side by side, left to right: their markers, how wide
  // all together, and the sum of where they would stand.
  type Group = { members: typeof order; width: number; sum: number };
  const leftOf = (group: Group) =>
    group.sum / group.members.length - group.width / 2;
  const groups: Group[] = [];
  for (const span of order) {
    let group: Group = { members: [span], width: span.width, sum: span.x };
    for (;;) {
      const before = groups[groups.length - 1];
      if (!before || leftOf(before) + before.width + markerGap <= leftOf(group))
        break;
      groups.pop();
      // The merged group centres on all its markers.
      group = {
        members: [...before.members, ...group.members],
        width: before.width + markerGap + group.width,
        sum: before.sum + group.sum,
      };
    }
    groups.push(group);
  }
  const placed = spans.map((span) => span.x);
  for (const group of groups) {
    let left = leftOf(group);
    for (const member of group.members) {
      placed[member.index] = left + member.width / 2;
      left += member.width + markerGap;
    }
  }
  return placed;
}

/**
 * The scale row: the upper and lower labels of the scale (#179), then the
 * markers of today and the project's dates, moved apart when they crowd.
 */
function ScaleRow(props: {
  axis: GanttAxis;
  gantt: ProjectGantt;
  narrow: boolean;
}) {
  const { axis, gantt } = props;
  const units = scaleUnits[axis.scale];
  const days = axis.eachDay();
  const uppers = days.filter((day, index) => index === 0 || units.upper(day));
  const lowers = days.filter(units.lower);
  const markers: { key: string; label: string; x: number; today?: boolean }[] =
    [
      {
        key: "today",
        label: t("Today"),
        x: axis.x(gantt.today) + axis.dayWidth / 2,
        today: true,
      },
    ];
  if (gantt.projectStart) {
    markers.push({
      key: "start",
      label: t("Project start"),
      x: axis.x(gantt.projectStart),
    });
  }
  if (gantt.projectDue) {
    markers.push({
      key: "due",
      label: t("Project due"),
      x: axis.endX(gantt.projectDue),
    });
  }
  // A marker's label: 10px text, 4px padding and a 1px border either side.
  const shownXs = spreadMarkers(
    markers.map((marker) => ({
      x: marker.x,
      width: textWidth(marker.label, 10) + 10,
    })),
  );
  /** Each label from its day to the next one's, the last to the axis end. */
  const labels = (
    starts: readonly CalendarDate[],
    row: "top" | "bottom",
    text: (day: CalendarDate) => string,
  ) =>
    starts.map((day, index) => {
      const next = starts[index + 1];
      const right = next ? axis.x(next) : axis.width;
      const isToday =
        axis.scale === "day" &&
        row === "bottom" &&
        compareDays(day, gantt.today) === 0;
      return (
        <div
          key={`${row}${day.year}-${day.month}-${day.day}`}
          className="nextaction-gantt-label"
          data-row={row}
          data-today={isToday || undefined}
          style={{ left: axis.x(day), width: right - axis.x(day) }}
        >
          {text(day)}
        </div>
      );
    });
  return (
    <div className="nextaction-gantt-head">
      {!props.narrow && (
        <div className="nextaction-gantt-corner">{t("Tasks")}</div>
      )}
      <div
        className="nextaction-gantt-scale"
        data-scale={axis.scale}
        style={{ width: axis.width }}
      >
        {labels(uppers, "top", units.upperLabel)}
        {labels(lowers, "bottom", units.lowerLabel)}
        {markers.map((marker, index) => (
          <div
            key={marker.key}
            className="nextaction-gantt-marker"
            data-today={marker.today || undefined}
            style={{ left: shownXs[index] }}
          >
            {marker.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The lines under the rows: a grid line where each lower label of the
 * scale starts (every day, week or month), a light dashed line at the
 * project's start and due dates, and today's line.
 */
function Lines(props: { axis: GanttAxis; gantt: ProjectGantt; left: number }) {
  const { axis, gantt } = props;
  const weeks = axis.eachDay().filter(scaleUnits[axis.scale].lower);
  return (
    <div
      className="nextaction-gantt-lines"
      style={{ left: props.left, width: axis.width }}
      aria-hidden="true"
    >
      {weeks.map((day) => (
        <i
          key={`${day.year}-${day.month}-${day.day}`}
          className="nextaction-gantt-grid"
          style={{ left: axis.x(day) }}
        />
      ))}
      {gantt.projectStart && (
        <i
          className="nextaction-gantt-project-line"
          style={{ left: axis.x(gantt.projectStart) }}
        />
      )}
      {gantt.projectDue && (
        <i
          className="nextaction-gantt-project-line"
          style={{ left: axis.endX(gantt.projectDue) }}
        />
      )}
      <i
        className="nextaction-gantt-today"
        style={{ left: axis.x(gantt.today) + axis.dayWidth / 2 }}
      />
    </div>
  );
}

/**
 * What a row draws on the axis, by its kind: a bar, its borrowed end dashed
 * and fading (#177), or a bracket. A bar takes its status icon's colour
 * (#178): done ones faded, someday ones a light dashed frame, overdue ones
 * outlined in red, blocked ones with a lock at the left end, the stretch
 * held back by a later effective start hatched.
 */
function BarView(props: {
  bar: Exclude<GanttBar, UnplacedBar>;
  row: GanttRow;
  axis: GanttAxis;
  cards: GanttCards;
}) {
  const { bar, row, axis, cards } = props;
  // A bracket's is nothing: it never drags (#180).
  const drag = useBarDrag(row, axis);
  const dragging = useBarDragging(row.task.id);
  const left = axis.x(bar.start);
  const text = shownText(row.task).text;
  const width = Math.max(axis.endX(bar.due) - left, 6);
  const dates = t("${start} → ${due}", {
    start: formatDate(bar.start, cards.today),
    due: formatDate(bar.due, cards.today),
  });
  if (bar.kind === "bracket") {
    // Never dragged, never opening the task panel: the name does that.
    const note = t("No dates of its own; spans its subtasks' dates");
    return (
      <div
        className="nextaction-gantt-bracket"
        role="img"
        style={{ left, width }}
        title={[text, dates, note].join("\n")}
        aria-label={[text, dates, note].join(", ")}
      />
    );
  }
  const borrowed =
    bar.borrowed === "start"
      ? t("No start date: the project's start date is used")
      : bar.borrowed === "due"
        ? t("No due date: the project's due date is used")
        : null;
  const held = row.heldBack;
  // The hatching, within the bar: up to the effective start or its end.
  const heldLeft = held ? Math.max(axis.x(held.from) - left, 0) : 0;
  const heldRight = held ? Math.min(axis.x(held.until) - left, width) : 0;
  const notes = [
    borrowed,
    statusLabel(row.task.status),
    row.overdue && t("Overdue"),
    row.blocked && t("Blocked"),
    held &&
      t("Can start from ${date}", {
        date: formatDate(held.until, cards.today),
      }),
    t("Drag to move, drag an end to change that date"),
  ].filter((note): note is string => typeof note === "string");
  return (
    <button
      {...drag}
      type="button"
      className="nextaction-gantt-bar"
      data-borrowed={bar.borrowed}
      data-status={row.task.status}
      data-overdue={row.overdue || undefined}
      data-dragging={dragging || undefined}
      style={
        {
          left,
          width,
          "--nextaction-gantt-status": statusIcons[row.task.status].color,
        } as React.CSSProperties
      }
      title={[text, dates, ...notes].join("\n")}
      aria-label={[text, dates, ...notes].join(", ")}
      onClick={() => cards.selectTask(row.task.id)}
    >
      {heldRight > heldLeft && (
        <i
          className="nextaction-gantt-held"
          style={{ left: heldLeft, width: heldRight - heldLeft }}
          aria-hidden="true"
        />
      )}
      {row.blocked && (
        <span className="nextaction-gantt-lock" aria-hidden="true">
          <i className="ti ti-lock" />
        </span>
      )}
      <BarEnds width={width} />
    </button>
  );
}

/**
 * The narrow tier's name of a row, in its lane: just after the bar's end,
 * or, without a bar, at the left edge of what shows. A click opens the task
 * panel, as the bar does.
 */
function NameBesideBar(props: {
  row: GanttRow;
  axis: GanttAxis;
  cards: GanttCards;
}) {
  const { row, axis, cards } = props;
  const text = shownText(row.task);
  // While dragged the dates show there instead (#180).
  if (useBarDragging(row.task.id)) return null;
  return (
    <button
      type="button"
      className="nextaction-gantt-bar-name"
      data-empty={text.empty || undefined}
      data-beside={row.bar.kind !== "unplaced" ? "bar" : undefined}
      aria-current={row.task.id === cards.selectedTaskId || undefined}
      title={text.text}
      style={
        row.bar.kind !== "unplaced"
          ? { left: axis.endX(row.bar.due) + 6 }
          : undefined
      }
      onClick={() => cards.selectTask(row.task.id)}
    >
      {text.text}
    </button>
  );
}

/** A row in the narrow tier: its bar and, beside it, its name. */
function NarrowRow(props: {
  row: GanttRow;
  axis: GanttAxis;
  cards: GanttCards;
}) {
  const { row, axis, cards } = props;
  return (
    <div
      className="nextaction-gantt-row"
      data-selected={row.task.id === cards.selectedTaskId || undefined}
      data-done={row.task.status === "done" || undefined}
    >
      <div className="nextaction-gantt-lane" style={{ width: axis.width }}>
        {row.bar.kind !== "unplaced" && (
          <BarView bar={row.bar} row={row} axis={axis} cards={cards} />
        )}
        <GanttOutsideDependencyMark row={row} axis={axis} />
        <GanttConflictMark row={row} axis={axis} />
        <NameBesideBar row={row} axis={axis} cards={cards} />
        <GanttDragDates row={row} axis={axis} today={cards.today} />
      </div>
    </div>
  );
}

/** The bar label's text size and its padding either side, in pixels. */
const barLabelSize = 12;
const barLabelPadding = 5;
/** The lock at a blocked bar's left end (`.nextaction-gantt-lock`). */
const lockWidth = 15;

/**
 * The wide tier's task name by its bar (#179): inside it when it fits
 * (after the lock of a blocked bar), else just after it; on the month
 * scale, where bars are short and close, not drawn when it does not fit
 * inside. Clicks go through to the bar. Only on a bar: a bracket is too
 * thin, its name in the tree column. The narrow tier has `NameBesideBar`.
 */
function BarLabel(props: {
  bar: Extract<GanttBar, { kind: "bar" }>;
  row: GanttRow;
  axis: GanttAxis;
}) {
  const { bar, row, axis } = props;
  const text = shownText(row.task);
  // While dragged the dates show there instead (#180).
  const dragging = useBarDragging(row.task.id);
  if (text.empty || dragging) return null;
  const left = axis.x(bar.start);
  const width = axis.endX(bar.due) - left;
  const inset = barLabelPadding + (row.blocked ? lockWidth : 0);
  const fits =
    textWidth(text.text, barLabelSize) + inset + barLabelPadding <= width;
  if (!fits && axis.scale === "month") return null;
  return (
    <span
      className="nextaction-gantt-bar-label"
      data-inside={fits || undefined}
      style={
        fits
          ? {
              left: left + inset,
              maxWidth: width - inset - barLabelPadding,
            }
          : { left: left + width + barLabelPadding }
      }
      aria-hidden="true"
    >
      {text.text}
    </span>
  );
}

/**
 * A row's name in the tree column: a click (or Enter) opens the task panel;
 * pressed and moved a few pixels, it drags into the notes as every task card
 * does (#122), writing a reference or a mirror there. Dropped in the chart
 * it does nothing: no tree moves in the gantt chart (#180). Not a button:
 * the card drag leaves presses on buttons alone.
 */
function TreeName(props: { row: GanttRow; cards: GanttCards }) {
  const { row, cards } = props;
  const text = shownText(row.task);
  const selected = row.task.id === cards.selectedTaskId;
  const drag = useCardDrag(row.task);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a button would never drag (the card drag leaves presses on buttons alone)
    <span
      {...drag}
      role="button"
      tabIndex={0}
      className="nextaction-gantt-name-text"
      data-empty={text.empty || undefined}
      aria-current={selected || undefined}
      title={text.text}
      onClick={() => cards.selectTask(row.task.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          cards.selectTask(row.task.id);
        }
      }}
    >
      {text.text}
    </span>
  );
}

/** A row: its name in the tree column, its bar in the lane. */
function Row(props: {
  row: GanttRow;
  axis: GanttAxis;
  cards: GanttCards;
  collapsible: boolean;
  expanded: boolean;
}) {
  const { row, axis, cards } = props;
  const selected = row.task.id === cards.selectedTaskId;
  return (
    <div
      className="nextaction-gantt-row"
      data-selected={selected || undefined}
      data-done={row.task.status === "done" || undefined}
    >
      <div
        className="nextaction-gantt-name"
        style={{ "--nextaction-gantt-depth": row.depth } as React.CSSProperties}
      >
        {props.collapsible ? (
          <button
            type="button"
            className="nextaction-gantt-caret"
            aria-expanded={props.expanded}
            aria-label={
              props.expanded ? t("Collapse subtasks") : t("Expand subtasks")
            }
            onClick={() => cards.expanded.toggle(row.task.id)}
          >
            <i
              className={
                props.expanded ? "ti ti-chevron-down" : "ti ti-chevron-right"
              }
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="nextaction-gantt-caret" />
        )}
        <StatusIcon status={row.task.status} />
        <TreeName row={row} cards={cards} />
      </div>
      <div className="nextaction-gantt-lane" style={{ width: axis.width }}>
        {row.bar.kind !== "unplaced" && (
          <BarView bar={row.bar} row={row} axis={axis} cards={cards} />
        )}
        {row.bar.kind === "bar" && (
          <BarLabel bar={row.bar} row={row} axis={axis} />
        )}
        <GanttOutsideDependencyMark row={row} axis={axis} />
        <GanttConflictMark row={row} axis={axis} />
        <GanttDragDates row={row} axis={axis} today={cards.today} />
      </div>
    </div>
  );
}

export function ProjectGanttChart(props: {
  gantt: ProjectGantt;
  cards: GanttCards;
  /** The time scale (#179). */
  scale: GanttScale;
}) {
  const { gantt, cards } = props;
  // No tree column, nothing collapsed; the stored collapsing stays for the
  // wider tiers.
  const narrow = usePanel().tier === "narrow";
  const tree = narrow ? 0 : treeWidth;
  const expanded = React.useSyncExternalStore(
    cards.expanded.subscribe,
    cards.expanded.current,
  );
  const axis = React.useMemo(
    () => createGanttAxis(props.scale, gantt.range),
    [props.scale, gantt.range],
  );
  const scrollerRef = React.useRef<HTMLElement>(null);
  // The axis's first day and its scale when last scrolled: `null` until the
  // chart first scrolls (one chart per project, keyed by its caller).
  const scrolledRef = React.useRef<{
    start: CalendarDate;
    scale: GanttScale;
  } | null>(null);
  React.useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const last = scrolledRef.current;
    if (last === null || last.scale !== axis.scale) {
      // Opened, or another scale: today a third of the way across the time
      // axis's visible part.
      const visible = scroller.clientWidth - tree;
      scroller.scrollLeft = Math.max(0, axis.x(gantt.today) - visible / 3);
    } else {
      // The range grew or shrank on the left (a date written): keep the
      // view still.
      scroller.scrollLeft += axis.x(last.start);
    }
    scrolledRef.current = { start: axis.range.start, scale: axis.scale };
  }, [axis, gantt.today, tree]);
  const drag = useChartBarDrag(gantt, cards.writeDates, scrollerRef);
  // A bar being dragged shows at its dragged dates in every drawing of the
  // rows: its arrows, its label, the narrow tier's name (#180).
  const chartRows = React.useMemo(
    () => draggedRows(gantt.rows, drag.dragged),
    [gantt.rows, drag.dragged],
  );
  const placed = React.useMemo(() => treeRows(chartRows), [chartRows]);
  const parents = React.useMemo(() => parentsOf(placed), [placed]);
  const rows = narrow ? placed : shownRows(placed, expanded);
  return (
    <GanttBarDragContext.Provider value={drag}>
      <section
        ref={scrollerRef}
        className="nextaction-gantt"
        aria-label={t("Gantt")}
        style={
          {
            "--nextaction-gantt-tree": `${tree}px`,
          } as React.CSSProperties
        }
      >
        <div
          className="nextaction-gantt-body"
          style={{ width: tree + axis.width }}
        >
          <ScaleRow axis={axis} gantt={gantt} narrow={narrow} />
          <div className="nextaction-gantt-rows">
            <Lines axis={axis} gantt={gantt} left={tree} />
            <GanttDependencyArrows rows={rows} axis={axis} left={tree} />
            {rows.map((row) =>
              narrow ? (
                <NarrowRow
                  key={row.task.id}
                  row={row}
                  axis={axis}
                  cards={cards}
                />
              ) : (
                <Row
                  key={row.task.id}
                  row={row}
                  axis={axis}
                  cards={cards}
                  collapsible={parents.has(row.task.id)}
                  expanded={expanded.has(row.task.id)}
                />
              ),
            )}
            {!narrow && <div className="nextaction-gantt-fill" />}
          </div>
        </div>
      </section>
      <UnplacedSection gantt={gantt} cards={cards} />
    </GanttBarDragContext.Provider>
  );
}

/**
 * The chart's bar drags (#180): the bar dragged and its dates. Let go, it
 * stays at its new dates while they are written, until the chart is read
 * again (the task changes signal) or the write fails; let go where it was
 * pressed, nothing is written.
 */
function useChartBarDrag(
  gantt: ProjectGantt,
  writeDates: WriteTaskDates,
  scrollerRef: React.RefObject<HTMLElement | null>,
): GanttBarDragDeps {
  const [dragged, setDragged] = React.useState<GanttDragged | null>(null);
  // Read again: what was let go shows as written.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every new read of the chart
  React.useEffect(() => {
    setDragged((current) => (current?.settled ? null : current));
  }, [gantt]);
  return React.useMemo(
    () => ({
      scroller: () => scrollerRef.current,
      dragged,
      drag(id, dates) {
        setDragged(dates ? { id, ...dates, settled: false } : null);
      },
      drop(id, dates, from) {
        if (sameDates(dates, from)) {
          setDragged(null);
          return;
        }
        setDragged({ id, ...dates, settled: true });
        void writeDates(id, dates).then((written) => {
          if (written) return;
          // Back where it was; the failure is told.
          setDragged((current) =>
            current?.id === id && current.settled ? null : current,
          );
        });
      },
    }),
    [dragged, writeDates, scrollerRef],
  );
}

/**
 * The unplaced tasks' section (GLOSSARY: 待排期任务, #177) at the bottom of
 * the chart, outside its scroller: "Unplaced tasks · N", a line saying why,
 * the tasks in note order, each opening the task panel. Collapsible, in
 * memory; none: no section. Done unplaced tasks are not in the read.
 */
function UnplacedSection(props: { gantt: ProjectGantt; cards: GanttCards }) {
  const { gantt, cards } = props;
  const collapsed = React.useSyncExternalStore(
    cards.unplacedCollapsed.subscribe,
    cards.unplacedCollapsed.current,
  );
  const unplaced = gantt.rows.filter((row) => row.bar.kind === "unplaced");
  if (unplaced.length === 0) return null;
  const title = t("Unplaced tasks · ${count}", {
    count: String(unplaced.length),
  });
  return (
    <section className="nextaction-gantt-unplaced" aria-label={title}>
      <button
        type="button"
        className="nextaction-gantt-unplaced-head"
        aria-expanded={!collapsed}
        onClick={() => cards.unplacedCollapsed.set(!collapsed)}
      >
        <i
          className={collapsed ? "ti ti-chevron-right" : "ti ti-chevron-down"}
          aria-hidden="true"
        />
        {title}
      </button>
      <p className="nextaction-gantt-unplaced-hint">
        {t("No dates set, or dates outside the project's time range")}
      </p>
      {!collapsed && (
        <ul className="nextaction-gantt-unplaced-list">
          {unplaced.map((row) => {
            const text = shownText(row.task);
            const selected = row.task.id === cards.selectedTaskId;
            return (
              <li key={row.task.id} data-selected={selected || undefined}>
                <StatusIcon status={row.task.status} />
                <button
                  type="button"
                  className="nextaction-gantt-name-text"
                  data-empty={text.empty || undefined}
                  aria-current={selected || undefined}
                  title={text.text}
                  onClick={() => cards.selectTask(row.task.id)}
                >
                  {text.text}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * The chart's time scale switch (#179): day, week, month; one choice for
 * every project, kept in memory.
 */
export function GanttScaleSwitch(props: { store: MemoryStore<GanttScale> }) {
  const { Segmented } = orca.components;
  const scale = React.useSyncExternalStore(
    props.store.subscribe,
    props.store.current,
  );
  return (
    <Segmented
      role="group"
      aria-label={t("Time scale")}
      className="nextaction-layout-switch"
      selected={scale}
      options={[
        { value: "day", label: t("Day") },
        { value: "week", label: t("Week") },
        { value: "month", label: t("Month") },
      ]}
      onChange={(value) =>
        props.store.set(
          value === "day" ? "day" : value === "month" ? "month" : "week",
        )
      }
    />
  );
}

/**
 * The chart's "Collapse all / Expand all", over the rows with subtasks;
 * none, or the narrow tier where nothing collapses: no button. Collapses all
 * while any is expanded.
 */
export function GanttCollapseAllButton(props: {
  gantt: ProjectGantt;
  expanded: IdSetStore<TaskId>;
}) {
  const { gantt, expanded } = props;
  const { Button, Tooltip } = orca.components;
  const narrow = usePanel().tier === "narrow";
  const current = React.useSyncExternalStore(
    expanded.subscribe,
    expanded.current,
  );
  const ids = [...parentsOf(treeRows(gantt.rows))];
  if (narrow || ids.length === 0) return null;
  const anyExpanded = ids.some((id) => current.has(id));
  const label = anyExpanded ? t("Collapse all") : t("Expand all");
  return (
    <Tooltip text={label}>
      <Button
        variant="plain"
        className="nextaction-toolbar-button"
        aria-label={label}
        onClick={() => expanded.setAll(ids, !anyExpanded)}
      >
        <i
          className={anyExpanded ? "ti ti-fold" : "ti ti-fold-down"}
          aria-hidden="true"
        />
      </Button>
    </Tooltip>
  );
}
