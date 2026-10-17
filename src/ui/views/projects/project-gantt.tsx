// The project details' gantt layout (GLOSSARY: 布局, #176, #186): a narrow
// task tree on the left (about 160px, names cut short, the full name on
// hover), the time axis on the right, a bar per row from the task's start
// to its due date. One scroller holds both, so they scroll up and down
// together; the scale row sticks to the top, the tree to the left. Rows keep
// note order; the tree collapses by task, only the project root tasks
// showing by default. A click on a bar or a name opens the task panel.
// Days become pixels only in gantt-axis.ts. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  GanttBar,
  GanttRow,
  ProjectGantt,
} from "../../../application/usecases/read-project-gantt";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
import { dayOfWeek } from "../../../domain/time/calendar-days";
import { t } from "../../../shared/l10n/l10n";
import { formatDate, shownText } from "../../components/format";
import { StatusIcon } from "../../components/status-icon";
import {
  chartRange,
  createGanttAxis,
  type GanttAxis,
  type GanttScale,
} from "./gantt-axis";
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
}

/** The tasks with a row below them in the read: those that can collapse. */
function parentsOf(rows: readonly GanttRow[]): ReadonlySet<TaskId> {
  return new Set(
    rows.flatMap((row) => (row.parentId === null ? [] : [row.parentId])),
  );
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
 * The scale row: the months above, the weeks below (#179 adds the day and
 * month scales), then the markers of today and the project's dates.
 */
function ScaleRow(props: { axis: GanttAxis; gantt: ProjectGantt }) {
  const { axis, gantt } = props;
  const days = axis.eachDay();
  const months = days.filter((day, index) => index === 0 || day.day === 1);
  const weeks = days.filter((day) => dayOfWeek(day) === 1);
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
  return (
    <div className="nextaction-gantt-head">
      <div className="nextaction-gantt-corner">{t("Tasks")}</div>
      <div className="nextaction-gantt-scale" style={{ width: axis.width }}>
        {months.map((day, index) => {
          const next = months[index + 1];
          const right = next ? axis.x(next) : axis.width;
          return (
            <div
              key={`m${day.year}-${day.month}`}
              className="nextaction-gantt-label"
              data-row="top"
              style={{ left: axis.x(day), width: right - axis.x(day) }}
            >
              {monthLabel(day)}
            </div>
          );
        })}
        {weeks.map((day) => (
          <div
            key={`w${day.year}-${day.month}-${day.day}`}
            className="nextaction-gantt-label"
            data-row="bottom"
            style={{ left: axis.x(day), width: 7 * axis.dayWidth }}
          >
            {weekLabel(day)}
          </div>
        ))}
        {markers.map((marker) => (
          <div
            key={marker.key}
            className="nextaction-gantt-marker"
            data-today={marker.today || undefined}
            style={{ left: marker.x }}
          >
            {marker.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The lines under the rows: a grid line every week, a light dashed line at
 * the project's start and due dates, and today's line.
 */
function Lines(props: { axis: GanttAxis; gantt: ProjectGantt }) {
  const { axis, gantt } = props;
  const weeks = axis.eachDay().filter((day) => dayOfWeek(day) === 1);
  return (
    <div
      className="nextaction-gantt-lines"
      style={{ left: treeWidth, width: axis.width }}
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
 * What a row draws on the axis, by its kind. For now one neutral colour
 * (#178 colours it by status); the other kinds come with #177.
 */
function BarView(props: {
  bar: GanttBar;
  row: GanttRow;
  axis: GanttAxis;
  cards: GanttCards;
}) {
  const { bar, row, axis, cards } = props;
  const left = axis.x(bar.start);
  const text = shownText(row.task).text;
  const dates = t("${start} → ${due}", {
    start: formatDate(bar.start, cards.today),
    due: formatDate(bar.due, cards.today),
  });
  return (
    <button
      type="button"
      className="nextaction-gantt-bar"
      data-borrowed={bar.borrowed}
      style={{ left, width: Math.max(axis.endX(bar.due) - left, 6) }}
      title={`${text}\n${dates}`}
      aria-label={`${text}, ${dates}`}
      onClick={() => cards.selectTask(row.task.id)}
    />
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
  const text = shownText(row.task);
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
      </div>
      <div className="nextaction-gantt-lane" style={{ width: axis.width }}>
        {row.bar && (
          <BarView bar={row.bar} row={row} axis={axis} cards={cards} />
        )}
      </div>
    </div>
  );
}

export function ProjectGanttChart(props: {
  gantt: ProjectGantt;
  cards: GanttCards;
  /** The time scale; only the week scale for now (#179). */
  scale: GanttScale;
}) {
  const { gantt, cards } = props;
  const expanded = React.useSyncExternalStore(
    cards.expanded.subscribe,
    cards.expanded.current,
  );
  const axis = React.useMemo(
    () => createGanttAxis(props.scale, chartRange(gantt)),
    [props.scale, gantt],
  );
  const parents = React.useMemo(() => parentsOf(gantt.rows), [gantt.rows]);
  const rows = shownRows(gantt.rows, expanded);
  return (
    <section
      className="nextaction-gantt"
      aria-label={t("Gantt")}
      style={
        {
          "--nextaction-gantt-tree": `${treeWidth}px`,
        } as React.CSSProperties
      }
    >
      <div
        className="nextaction-gantt-body"
        style={{ width: treeWidth + axis.width }}
      >
        <ScaleRow axis={axis} gantt={gantt} />
        <div className="nextaction-gantt-rows">
          <Lines axis={axis} gantt={gantt} />
          {rows.map((row) => (
            <Row
              key={row.task.id}
              row={row}
              axis={axis}
              cards={cards}
              collapsible={parents.has(row.task.id)}
              expanded={expanded.has(row.task.id)}
            />
          ))}
          <div className="nextaction-gantt-fill" />
        </div>
      </div>
    </section>
  );
}

/**
 * The chart's "Collapse all / Expand all", over the rows with subtasks;
 * none: no button. Collapses all while any is expanded.
 */
export function GanttCollapseAllButton(props: {
  gantt: ProjectGantt;
  expanded: IdSetStore<TaskId>;
}) {
  const { gantt, expanded } = props;
  const { Button, Tooltip } = orca.components;
  const current = React.useSyncExternalStore(
    expanded.subscribe,
    expanded.current,
  );
  const ids = [...parentsOf(gantt.rows)];
  if (ids.length === 0) return null;
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
