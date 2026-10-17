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
} from "../../../application/usecases/read-project-gantt";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
import { dayOfWeek } from "../../../domain/time/calendar-days";
import { t } from "../../../shared/l10n/l10n";
import { formatDate, shownText } from "../../components/format";
import { StatusIcon } from "../../components/status-icon";
import { statusLabel } from "../../components/status-label";
import { usePanel } from "../../panel/panel-context";
import { statusIcons } from "../../task-menu/status-icons";
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
function ScaleRow(props: {
  axis: GanttAxis;
  gantt: ProjectGantt;
  narrow: boolean;
}) {
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
      {!props.narrow && (
        <div className="nextaction-gantt-corner">{t("Tasks")}</div>
      )}
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
function Lines(props: { axis: GanttAxis; gantt: ProjectGantt; left: number }) {
  const { axis, gantt } = props;
  const weeks = axis.eachDay().filter((day) => dayOfWeek(day) === 1);
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
 * What a row draws on the axis, by its kind; the other kinds come with
 * #177. A bar takes its status icon's colour (#178): done ones faded,
 * someday ones a light dashed frame, overdue ones outlined in red, blocked
 * ones with a lock at the left end, the stretch held back by a later
 * effective start hatched.
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
  const width = Math.max(axis.endX(bar.due) - left, 6);
  const dates = t("${start} → ${due}", {
    start: formatDate(bar.start, cards.today),
    due: formatDate(bar.due, cards.today),
  });
  const held = row.heldBack;
  // The hatching, within the bar: up to the effective start or its end.
  const heldLeft = held ? Math.max(axis.x(held.from) - left, 0) : 0;
  const heldRight = held ? Math.min(axis.x(held.until) - left, width) : 0;
  const notes = [
    statusLabel(row.task.status),
    row.overdue && t("Overdue"),
    row.blocked && t("Blocked"),
    held &&
      t("Can start from ${date}", {
        date: formatDate(held.until, cards.today),
      }),
  ].filter((note): note is string => typeof note === "string");
  return (
    <button
      type="button"
      className="nextaction-gantt-bar"
      data-borrowed={bar.borrowed}
      data-status={row.task.status}
      data-overdue={row.overdue || undefined}
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
  return (
    <button
      type="button"
      className="nextaction-gantt-bar-name"
      data-empty={text.empty || undefined}
      data-beside={row.bar ? "bar" : undefined}
      aria-current={row.task.id === cards.selectedTaskId || undefined}
      title={text.text}
      style={row.bar ? { left: axis.endX(row.bar.due) + 6 } : undefined}
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
        {row.bar && (
          <BarView bar={row.bar} row={row} axis={axis} cards={cards} />
        )}
        <NameBesideBar row={row} axis={axis} cards={cards} />
      </div>
    </div>
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
  // No tree column, nothing collapsed; the stored collapsing stays for the
  // wider tiers.
  const narrow = usePanel().tier === "narrow";
  const tree = narrow ? 0 : treeWidth;
  const expanded = React.useSyncExternalStore(
    cards.expanded.subscribe,
    cards.expanded.current,
  );
  const axis = React.useMemo(
    () => createGanttAxis(props.scale, chartRange(gantt)),
    [props.scale, gantt],
  );
  const parents = React.useMemo(() => parentsOf(gantt.rows), [gantt.rows]);
  const rows = narrow ? gantt.rows : shownRows(gantt.rows, expanded);
  return (
    <section
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
  const ids = [...parentsOf(gantt.rows)];
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
