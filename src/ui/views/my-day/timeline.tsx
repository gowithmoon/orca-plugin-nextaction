// The timeline (GLOSSARY: 时间轴, #84): today's scheduled tasks by time,
// across the whole logical day from the day boundary to the next one, 48 px
// an hour, no zoom. Whole hours are ticked with their clock time; the current
// time line moves once a minute; past hours show and can be scheduled too.
// Overlapping schedules sit side by side (timeline-lanes.ts). It scrolls by
// itself, opening near the current time.
//
// Built for dragging (#85): the track (`data-nextaction-my-day-drop=
// "timeline"`) is where pointers turn into moments (timeline-geometry.ts
// `momentAtY`); each card (`data-nextaction-timeline-card`) has its body to
// drag and a bottom edge (`.nextaction-timeline-card-resize`) to change the
// length; the unscheduled area is the other drop target (my-day-view.tsx).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ScheduledMyDayItem } from "../../../application/usecases/read-my-day";
import type { TaskId } from "../../../domain/task/task";
import type { LogicalDayRange } from "../../../domain/time/logical-day";
import { t } from "../../../shared/l10n/l10n";
import {
  formatClock,
  formatTimeRange,
  shownText,
} from "../../components/format";
import { StatusButton } from "../../components/task-card";
import type { TaskActions } from "../../hooks/use-task-actions";
import type { TaskMenuItems, TaskMenuPlace } from "../../task-menu/menu-items";
import { TaskMenu } from "../../task-menu/task-menu";
import { TimelinePreview, useDragSource } from "./my-day-drag";
import {
  hourTicks,
  scheduleBox,
  timelineHeight,
  yAt,
} from "./timeline-geometry";
import { assignLanes, type LaneSlot } from "./timeline-lanes";

/** Below this height (px) a card shows its text only: 15 and 30 minutes. */
const compactBelowPx = 36;
/** On opening, the current time sits this far down the visible part. */
const nowAtFraction = 1 / 3;

/** What a card can do; the same as the other views' cards (#84). */
export interface TimelineCardActions {
  readonly actions: TaskActions;
  readonly menuItems: TaskMenuItems | undefined;
  readonly menuPlace: TaskMenuPlace;
  /** Opens the task panel. */
  readonly onOpen: (item: ScheduledMyDayItem) => void;
  /** Opens the schedule popup. */
  readonly onSchedule: (item: ScheduledMyDayItem) => void;
}

/** The button that opens the schedule popup, on every card in My Day. */
export function ScheduleButton(props: { onClick: () => void }) {
  const { Tooltip } = orca.components;
  return (
    <Tooltip text={t("Schedule")}>
      <button
        type="button"
        className="nextaction-task-card-button nextaction-task-card-extra"
        aria-label={t("Schedule")}
        onClick={(event) => {
          event.stopPropagation();
          props.onClick();
        }}
      >
        <i className="ti ti-clock" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

/** A scheduled task on the timeline, placed by its schedule and lane. */
export function TimelineCard(props: {
  item: ScheduledMyDayItem;
  range: LogicalDayRange;
  slot: LaneSlot;
  selected: boolean;
  card: TimelineCardActions;
}) {
  const { item, range, slot, selected, card } = props;
  const { ContextMenu } = orca.components;
  const { task } = item;
  const box = scheduleBox(range, item.schedule);
  const compact = box.height < compactBelowPx;
  const text = shownText(task);
  const times = formatTimeRange(item.schedule);
  // The body moves it, the bottom edge changes its length (#85); done
  // cards too, as the timeline records the day.
  const drag = useDragSource((target) => ({
    kind: target.closest(".nextaction-timeline-card-resize")
      ? "resize"
      : "move",
    task,
    schedule: item.schedule,
  }));
  const style = {
    top: `${box.top}px`,
    height: `${box.height}px`,
    "--nextaction-lane": slot.lane,
    "--nextaction-lanes": slot.lanes,
  } as React.CSSProperties;

  const article = (onContextMenu?: (event: React.MouseEvent) => void) => (
    <article
      {...drag}
      className="nextaction-timeline-card"
      style={style}
      data-nextaction-timeline-card={task.id}
      data-compact={compact || undefined}
      data-done={task.status === "done" || undefined}
      data-selected={selected || undefined}
      aria-current={selected || undefined}
      aria-label={t("${text}, ${times}", { text: text.text, times })}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: as the task card, focusable so Enter opens the task panel; it holds buttons, so it cannot be one
      tabIndex={0}
      onClick={(event) => {
        // A menu item chosen in a menu opened from this card is not a click on it.
        if (!(event.target instanceof Node)) return;
        if (!event.currentTarget.contains(event.target)) return;
        card.onOpen(item);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) {
          event.preventDefault();
          card.onOpen(item);
        }
      }}
      onContextMenu={
        onContextMenu &&
        ((event) => {
          if (!(event.target instanceof Node)) return;
          if (!event.currentTarget.contains(event.target)) return;
          onContextMenu(event);
        })
      }
    >
      {/* What dragging moves (#85): everything but the buttons and the edge. */}
      <div className="nextaction-timeline-card-body">
        {!compact && (
          <div className="nextaction-timeline-card-status">
            <StatusButton task={task} actions={card.actions} />
          </div>
        )}
        <div className="nextaction-timeline-card-main">
          <div
            className="nextaction-timeline-card-text"
            data-empty={text.empty || undefined}
            title={text.text}
          >
            {text.text}
          </div>
          {!compact && (
            <div className="nextaction-timeline-card-meta">
              <span>{times}</span>
              {item.overdue && (
                <span className="nextaction-property-overdue">
                  {t("Overdue")}
                </span>
              )}
            </div>
          )}
        </div>
        {compact && item.overdue && (
          <span
            className="nextaction-timeline-card-overdue-dot"
            role="img"
            aria-label={t("Overdue")}
          />
        )}
        <ScheduleButton onClick={() => card.onSchedule(item)} />
      </div>
      {/* The bottom edge, for changing the length by dragging (#85). */}
      <div className="nextaction-timeline-card-resize" aria-hidden="true" />
    </article>
  );

  if (!card.menuItems) return article();
  const menuItems = card.menuItems;
  return (
    <ContextMenu
      menu={(close) => (
        <TaskMenu
          items={menuItems}
          task={task}
          close={close}
          place={card.menuPlace}
        />
      )}
    >
      {(open) => article(open)}
    </ContextMenu>
  );
}

/** The timeline of today's range, with `items` (by start) on it. */
export function Timeline(props: {
  range: LogicalDayRange;
  items: readonly ScheduledMyDayItem[];
  /** The current time, once a minute. */
  now: Date;
  selectedTaskId: TaskId | undefined;
  card: TimelineCardActions;
}) {
  const { range, items, now, selectedTaskId, card } = props;
  const scroller = React.useRef<HTMLDivElement>(null);
  const height = timelineHeight(range);
  const ticks = React.useMemo(() => hourTicks(range), [range]);
  const slots = React.useMemo(
    () => assignLanes(items.map((item) => item.schedule)),
    [items],
  );
  const nowShown =
    now.getTime() >= range.start.getTime() &&
    now.getTime() < range.end.getTime();
  const nowY = yAt(range, now);

  // Opening (and a new day, which mounts afresh) scrolls to the current time.
  const scrolled = React.useRef(false);
  React.useLayoutEffect(() => {
    const element = scroller.current;
    if (scrolled.current || !element) return;
    scrolled.current = true;
    element.scrollTop = Math.max(
      0,
      nowY - element.clientHeight * nowAtFraction,
    );
  }, [nowY]);

  return (
    <div className="nextaction-timeline-scroll" ref={scroller}>
      <div className="nextaction-timeline" style={{ height: `${height}px` }}>
        <ol className="nextaction-timeline-hours" aria-hidden="true">
          {ticks.map((tick) => (
            <li
              key={tick.at.getTime()}
              className="nextaction-timeline-hour"
              data-top={tick.y === 0 || undefined}
              style={{ top: `${tick.y}px` }}
            >
              <span className="nextaction-timeline-hour-label">
                {formatClock(tick.at)}
              </span>
            </li>
          ))}
        </ol>
        <div
          className="nextaction-timeline-track"
          data-nextaction-my-day-drop="timeline"
        >
          {items.map((item, index) => (
            <TimelineCard
              key={item.task.id}
              item={item}
              range={range}
              slot={slots[index] ?? { lane: 0, lanes: 1 }}
              selected={item.task.id === selectedTaskId}
              card={card}
            />
          ))}
          {/* Renders by itself while dragging; the cards stay as they are. */}
          <TimelinePreview range={range} />
          {nowShown && (
            <div
              className="nextaction-timeline-now"
              style={{ top: `${nowY}px` }}
              role="img"
              aria-label={t("Now, ${time}", { time: formatClock(now) })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
