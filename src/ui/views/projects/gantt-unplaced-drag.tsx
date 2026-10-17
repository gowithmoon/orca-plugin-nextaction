// Dragging an unplaced task (GLOSSARY: 待排期任务) onto the gantt chart's
// time axis (#181): the day under the pointer becomes its start date, its
// due date a week on (`unplacedTaskDates`), snapping by day; a week-long bar
// with "10月20日 → 10月26日" shows at the pointer's row meanwhile. Letting go
// on the axis writes both dates in one edit task write and one undo, as a
// bar's drag (#180), and expands the task's ancestors so the bar it gets
// shows in the tree; the task changes signal reads the chart again, which
// moves it out of the unplaced section. Let go anywhere else in the plugin
// panel, nothing happens.
// The unplaced tasks are card drags (`useCardDrag`), as the tree's names:
// let go on a block in a note panel they write a reference or a mirror
// there. The axis is this drag's `inPanel` drop, the chart's own: no other
// view drops there. Pixels become days only through the axis (`dayAt`).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  GanttRow,
  ProjectGantt,
} from "../../../application/usecases/read-project-gantt";
import { unplacedTaskDates } from "../../../domain/project/unplaced-schedule";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { shownText } from "../../components/format";
import { type PanelDropTarget, useCardDrag } from "../../drag/card-drag";
import type { WriteTaskDates } from "../../hooks/use-write-task-dates";
import type { GanttAxis } from "./gantt-axis";
import { type BarDates, dayLabel, sameDates } from "./gantt-bar-drag";
import type { IdSetStore } from "./project-board-stores";

/** A row's height, as `--nextaction-gantt-row`. */
const rowHeight = 30;

/**
 * Where an unplaced task would land: the dates a drop writes, and the row
 * of the chart the pointer is at, from the top of `.nextaction-gantt-rows`.
 * `settled`: let go, being written; it shows so until the chart is read
 * again or the write fails.
 */
export interface UnplacedLanding extends BarDates {
  readonly id: TaskId;
  readonly row: number;
  readonly settled: boolean;
}

/** What the chart gives its unplaced tasks' drags. */
export interface UnplacedDrag {
  /** Where the task being dragged would land, if over the axis. */
  readonly landing: UnplacedLanding | null;
  /** The axis as a drop place for the task `id`. */
  dropFor(id: TaskId): PanelDropTarget;
}

/** The ids of `id`'s ancestor rows, its parent first. */
function ancestorsOf(rows: readonly GanttRow[], id: TaskId): TaskId[] {
  const parents = new Map(rows.map((row) => [row.task.id, row.parentId]));
  const ancestors: TaskId[] = [];
  for (
    let parent = parents.get(id) ?? null;
    parent !== null && !ancestors.includes(parent);
    parent = parents.get(parent) ?? null
  ) {
    ancestors.push(parent);
  }
  return ancestors;
}

/**
 * The chart's unplaced tasks' drags: where the one dragged would land, and
 * the axis as its drop place. `tree`: the tree column's width, on the left
 * of the scroller, no drop place.
 */
export function useUnplacedDrag(props: {
  gantt: ProjectGantt;
  axis: GanttAxis;
  tree: number;
  scrollerRef: React.RefObject<HTMLElement | null>;
  rowsRef: React.RefObject<HTMLElement | null>;
  writeDates: WriteTaskDates;
  expanded: IdSetStore<TaskId>;
}): UnplacedDrag {
  const [landing, setLanding] = React.useState<UnplacedLanding | null>(null);
  const latest = React.useRef(props);
  latest.current = props;
  // Read again: what was let go shows as written, in the tree.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every new read of the chart
  React.useEffect(() => {
    setLanding((current) => (current?.settled ? null : current));
  }, [props.gantt]);

  // The same for the whole drag: a card drag keeps the drop place it was
  // pressed with. All it reads is in `latest`.
  const dropFor = React.useMemo(() => {
    /** Where the task `id` lands with the pointer at (x, y); `null`: off the axis. */
    const landingAt = (
      id: TaskId,
      x: number,
      y: number,
    ): UnplacedLanding | null => {
      const { axis, tree, scrollerRef, rowsRef } = latest.current;
      const scroller = scrollerRef.current;
      const rows = rowsRef.current;
      if (!scroller || !rows) return null;
      const box = scroller.getBoundingClientRect();
      // The time axis's visible part: right of the tree column, below the
      // scale row (which sticks to the top), within the scrollbars.
      const head = scroller.querySelector(".nextaction-gantt-head");
      const top = head ? head.getBoundingClientRect().bottom : box.top;
      if (
        x < box.left + tree ||
        x >= box.left + scroller.clientWidth ||
        y < top ||
        y >= box.top + scroller.clientHeight
      ) {
        return null;
      }
      const rowsBox = rows.getBoundingClientRect();
      const last = Math.max(Math.floor(rows.offsetHeight / rowHeight) - 1, 0);
      const row = Math.min(
        Math.max(Math.floor((y - rowsBox.top) / rowHeight), 0),
        last,
      );
      const day: CalendarDate = axis.dayAt(
        x - box.left - tree + scroller.scrollLeft,
      );
      return { id, ...unplacedTaskDates(day), row, settled: false };
    };

    /** Shown if it moved to another day or row. */
    const show = (next: UnplacedLanding | null) =>
      setLanding((current) => {
        if (current?.settled) return current;
        if (!next || !current) return next;
        return current.id === next.id &&
          current.row === next.row &&
          sameDates(current, next)
          ? current
          : next;
      });

    const write = (shown: UnplacedLanding) => {
      const { gantt, writeDates, expanded } = latest.current;
      setLanding({ ...shown, settled: true });
      void writeDates(shown.id, shown).then((written) => {
        if (written) {
          // Its bar in the tree, under expanded rows.
          expanded.setAll(ancestorsOf(gantt.rows, shown.id), true);
          return;
        }
        // Back in the unplaced section; the failure is told.
        setLanding((current) =>
          current?.id === shown.id && current.settled ? null : current,
        );
      });
    };

    return (id: TaskId): PanelDropTarget => ({
      move(x, y) {
        show(landingAt(id, x, y));
      },
      drop(x, y) {
        const shown = landingAt(id, x, y);
        if (!shown) return false;
        write(shown);
        return true;
      },
      end() {
        setLanding((current) => (current?.settled ? current : null));
      },
      scrollers: () => {
        const scroller = latest.current.scrollerRef.current;
        return scroller ? [scroller] : [];
      },
      sideScrollers: () => {
        const scroller = latest.current.scrollerRef.current;
        return scroller ? [scroller] : [];
      },
    });
  }, []);
  return React.useMemo(() => ({ landing, dropFor }), [landing, dropFor]);
}

/**
 * Where the unplaced task being dragged would land: a week-long bar at the
 * pointer's row, its name in it, the dates it would get just after it.
 * Inside `.nextaction-gantt-rows`; `left`: the tree column's width.
 */
export function GanttUnplacedLanding(props: {
  landing: UnplacedLanding | null;
  gantt: ProjectGantt;
  axis: GanttAxis;
  left: number;
}) {
  const { landing, gantt, axis } = props;
  if (!landing) return null;
  const task = gantt.rows.find((row) => row.task.id === landing.id)?.task;
  const start = props.left + axis.x(landing.start);
  const end = props.left + axis.endX(landing.due);
  const top = landing.row * rowHeight;
  return (
    <>
      <div
        className="nextaction-gantt-landing"
        style={{ top: top + 6, left: start, width: end - start }}
        aria-hidden="true"
      >
        {task && shownText(task).text}
      </div>
      <span
        className="nextaction-gantt-drag-dates"
        style={{ top: top + 5, left: end + 6 }}
        aria-live="polite"
      >
        {t("${start} → ${due}", {
          start: dayLabel(landing.start, gantt.today),
          due: dayLabel(landing.due, gantt.today),
        })}
      </span>
    </>
  );
}

/**
 * An unplaced task's name: a click (or Enter) opens the task panel; pressed
 * and moved a few pixels, it drags onto the time axis, or into the notes as
 * the tree's names do. Not a button: the card drag leaves presses on buttons
 * alone. Faded while being written.
 */
export function UnplacedName(props: {
  row: GanttRow;
  drag: UnplacedDrag;
  selected: boolean;
  onSelect: () => void;
}) {
  const { row, drag, selected, onSelect } = props;
  const text = shownText(row.task);
  const id = row.task.id;
  const { dropFor } = drag;
  const inPanel = React.useMemo(() => dropFor(id), [dropFor, id]);
  const cardDrag = useCardDrag(row.task, { inPanel });
  return (
    // biome-ignore lint/a11y/useSemanticElements: a button would never drag (the card drag leaves presses on buttons alone)
    <span
      {...cardDrag}
      role="button"
      tabIndex={0}
      className="nextaction-gantt-name-text"
      data-empty={text.empty || undefined}
      data-landing={drag.landing?.id === id || undefined}
      aria-current={selected || undefined}
      title={[text.text, t("Drag onto the time axis to schedule it")].join(
        "\n",
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {text.text}
    </span>
  );
}
