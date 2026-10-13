// The My Day view (GLOSSARY: 我的一天视图, #83): the tasks in today's My Day,
// the unscheduled ones in the unscheduled area, with a search box beside its
// title to add more, the scheduled ones on the timeline (GLOSSARY: 时间轴,
// #84). The layout shell holds the two side by side or one above the other,
// by the view's own width (not the plugin panel's tier), and fills the view's
// height: each area scrolls by itself. Every card has a button for
// the schedule popup (#84). Between the next actions and all tasks in the
// navigation, with no count there. It reads when the plugin panel opens and
// again on every task change signal (ADR 0007); open across the day boundary,
// it moves on to the new day. Verified by hand in Orca (docs/ARCHITECTURE.md
// §5).
import * as React from "react";
import type { AddToMyDay } from "../../../application/usecases/add-to-my-day";
import type {
  MyDayItem,
  ReadMyDay,
  ScheduledMyDayItem,
  TodaysMyDay,
} from "../../../application/usecases/read-my-day";
import type {
  MyDayCandidate,
  ReadMyDayCandidates,
} from "../../../application/usecases/read-my-day-candidates";
import type { MyDaySchedule } from "../../../domain/task/my-day";
import type { CalendarDate } from "../../../domain/task/task";
import type { SelectOption } from "../../../orca.d.ts";
import type { ChangeSignalSource } from "../../../shared/change-signal";
import { t } from "../../../shared/l10n/l10n";
import { shownText } from "../../components/format";
import { TaskListPlaceholder } from "../../components/loading-placeholder";
import { Select } from "../../components/popup-controls";
import { TaskCard } from "../../components/task-card";
import { taskSearchFilter } from "../../components/task-search-filter";
import { ViewHeader } from "../../components/view-header";
import { FailedNotice, PausedNotice } from "../../components/view-notice";
import { useAddToMyDay } from "../../hooks/use-add-to-my-day";
import { useMyDayCandidates } from "../../hooks/use-my-day-candidates";
import { useNow } from "../../hooks/use-now";
import {
  type TaskActionsDeps,
  useTaskActions,
} from "../../hooks/use-task-actions";
import { useToday } from "../../hooks/use-today";
import {
  createViewQuery,
  useViewQuery,
  type ViewQuery,
} from "../../hooks/use-view-query";
import { usePanel } from "../../panel/panel-context";
import type { PanelView } from "../../panel/panel-views";
import type { TaskMenuItems } from "../../task-menu/menu-items";
import {
  createMyDayDrag,
  DragChip,
  DragWatch,
  type MyDayDrag,
  MyDayDragProvider,
  type MyDayDragSetup,
  useDragSource,
} from "./my-day-drag";
import type { MyDayScheduleActions } from "./my-day-schedule-actions";
import { useOptimisticMyDay } from "./optimistic-my-day";
import type { OpenSchedulePopup } from "./schedule-popup";
import { ScheduleButton, Timeline, type TimelineCardActions } from "./timeline";

export interface MyDayViewDeps {
  readMyDay: ReadMyDay;
  readMyDayCandidates: ReadMyDayCandidates;
  addToMyDay: AddToMyDay;
  /** The current logical day, for dates, overdue and moving to a new day. */
  today: () => CalendarDate;
  /** The current time: the timeline's current time line, a new schedule's start. */
  now: () => Date;
  /** Tasks may have changed: My Day and the candidates are read again. */
  changes: ChangeSignalSource;
  /**
   * The day boundary setting changed: today's range, and with it the
   * timeline and what reads as unscheduled, is read again (#81).
   */
  dayBoundaryChanges: ChangeSignalSource;
  /** The cards' status menu, "open in notes" and notices. */
  taskActions: TaskActionsDeps;
  /** The task menu's registrations, for a right-click on a card. */
  menuItems: () => TaskMenuItems | undefined;
  /** Opens the schedule popup (#84). */
  openSchedulePopup: OpenSchedulePopup;
  /** The writes a drop makes (#85), reporting their failures. */
  scheduleActions: MyDayScheduleActions;
}

/** A card's task and, on the timeline, its schedule: what the popup opens on. */
type ScheduleTarget = MyDayItem & { readonly schedule?: MyDaySchedule };

/** The candidates as the search offers them, by text. */
function candidateOptions(
  candidates: readonly MyDayCandidate[],
): SelectOption[] {
  return candidates
    .map((candidate) => ({
      text: shownText(candidate).text,
      value: String(candidate.id),
    }))
    .sort((a, b) => a.text.localeCompare(b.text))
    .map((entry) => ({ value: entry.value, label: entry.text }));
}

/**
 * The search box beside the unscheduled area's title: words of a task's text
 * or search text find it (#112), choosing it adds it to today's My Day,
 * unscheduled.
 */
function AddSearch(props: { deps: MyDayViewDeps }) {
  const { deps } = props;
  const candidates = useMyDayCandidates(
    deps.readMyDayCandidates,
    deps.changes,
    deps.taskActions.notify,
  );
  const add = useAddToMyDay(deps.addToMyDay, deps.taskActions.notify);
  const options = candidateOptions(candidates);
  return (
    <div className="nextaction-my-day-search">
      <Select
        selected={[]}
        options={options}
        filter={true}
        filterFunction={taskSearchFilter(candidates, options)}
        filterPlaceholder={t("Search tasks")}
        placeholder={t("Search to add")}
        width="100%"
        alignment="right"
        // Framed like the search boxes of the other views (my-day-style.ts).
        buttonClassName="nextaction-my-day-search-button"
        pre={<i className="ti ti-search" aria-hidden="true" />}
        onChange={(selected) => {
          const picked = Number(selected[0]);
          if (!Number.isInteger(picked)) return;
          add(picked);
        }}
      />
    </div>
  );
}

function UnscheduledList(props: {
  read: TodaysMyDay;
  today: CalendarDate;
  deps: MyDayViewDeps;
  onSchedule: (item: ScheduleTarget) => void;
}) {
  const { read, today, deps, onSchedule } = props;
  const actions = useTaskActions(deps.taskActions);
  const menuItems = deps.menuItems();
  const { selectedTaskId, selectTask } = usePanel();
  const menuPlace = React.useMemo(() => ({ selectTask }), [selectTask]);
  const items = read.unscheduled;
  // Empty, one line: the timeline below keeps the room.
  if (items.length === 0 && read.scheduled.length === 0) {
    return (
      <div className="nextaction-my-day-unscheduled-empty" role="status">
        <span className="nextaction-my-day-unscheduled-empty-title">
          {t("Nothing in My Day yet")}
        </span>{" "}
        {t(
          "Search beside the title to add a task, or choose “Add to My Day” in a task's menu.",
        )}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="nextaction-my-day-unscheduled-empty">
        {t("Everything in My Day is scheduled.")}
      </div>
    );
  }
  return (
    <ul className="nextaction-task-list">
      {items.map((item) => (
        <UnscheduledItem key={item.task.id} item={item}>
          <TaskCard
            task={item.task}
            today={today}
            actions={actions}
            menuItems={menuItems}
            menuPlace={menuPlace}
            onOpen={(open) => selectTask(open.id)}
            selected={item.task.id === selectedTaskId}
            // Completed today but advanced to todo (#95).
            doneToday={item.done && item.task.status !== "done"}
            // Skipped today and advanced to todo (#91).
            skippedToday={item.skipped}
            buttons={<ScheduleButton onClick={() => onSchedule(item)} />}
          />
        </UnscheduledItem>
      ))}
    </ul>
  );
}

/** An unscheduled card, to drag onto the timeline (#85). */
function UnscheduledItem(props: {
  item: MyDayItem;
  children: React.ReactNode;
}) {
  const { task } = props.item;
  const drag = useDragSource(() => ({ kind: "add", task }));
  return (
    <li className="nextaction-my-day-unscheduled-item" {...drag}>
      {props.children}
    </li>
  );
}

function TimelineArea(props: {
  read: TodaysMyDay;
  deps: MyDayViewDeps;
  onSchedule: (item: ScheduleTarget) => void;
}) {
  const { read, deps, onSchedule } = props;
  const now = useNow(deps.now);
  const actions = useTaskActions(deps.taskActions);
  const menuItems = deps.menuItems();
  const { selectedTaskId, selectTask } = usePanel();
  const card = React.useMemo<TimelineCardActions>(
    () => ({
      actions,
      menuItems,
      menuPlace: { selectTask },
      onOpen: (item: ScheduledMyDayItem) => selectTask(item.task.id),
      onSchedule,
    }),
    [actions, menuItems, selectTask, onSchedule],
  );
  return (
    <Timeline
      range={read.range}
      items={read.scheduled}
      now={now}
      selectedTaskId={selectedTaskId}
      card={card}
    />
  );
}

/**
 * Both areas from one read. Loading, paused and failed show once, in the
 * unscheduled area; the timeline shows once there is a read.
 */
function MyDayAreas(props: {
  query: ViewQuery<TodaysMyDay>;
  today: CalendarDate;
  deps: MyDayViewDeps;
}) {
  const { query, today, deps } = props;
  // What a drop wrote shows at once, until a read after it arrives (#85).
  const { shown: state, commit } = useOptimisticMyDay(
    query,
    useViewQuery(query),
    deps.scheduleActions,
  );
  const read = state.kind === "loaded" ? state.data : undefined;
  const range = read?.range;
  const root = React.useRef<HTMLDivElement>(null);
  // The drag lives as long as the areas; it reads these when it needs them.
  const setup = React.useRef<MyDayDragSetup>({
    root: null,
    range: undefined,
    commit,
  });
  setup.current = { root: root.current, range, commit };
  const drag = React.useRef<MyDayDrag>();
  drag.current ??= createMyDayDrag(() => ({
    ...setup.current,
    root: root.current,
  }));
  const onSchedule = React.useCallback(
    (item: ScheduleTarget) => {
      if (!range) return;
      deps.openSchedulePopup({
        task: item.task,
        range,
        ...(item.schedule && { schedule: item.schedule }),
        now: deps.now(),
      });
    },
    [range, deps],
  );

  let search: React.ReactNode;
  let unscheduled: React.ReactNode;
  if (state.kind === "loading") unscheduled = <TaskListPlaceholder />;
  else if (state.kind === "paused") unscheduled = <PausedNotice />;
  else if (state.kind === "failed") {
    unscheduled = (
      <FailedNotice
        error={state.error}
        message={(reason) => t("Could not read My Day: ${reason}", { reason })}
        onRetry={() => query.reset()}
      />
    );
  } else {
    search = <AddSearch deps={deps} />;
    unscheduled = (
      <UnscheduledList
        read={state.data}
        today={today}
        deps={deps}
        onSchedule={onSchedule}
      />
    );
  }

  return (
    <MyDayDragProvider value={drag.current}>
      <div className="nextaction-my-day-layout" ref={root}>
        <MyDaySections
          search={search}
          unscheduled={unscheduled}
          timeline={
            read && (
              <TimelineArea read={read} deps={deps} onSchedule={onSchedule} />
            )
          }
        />
        <DragChip />
        <DragWatch root={root} />
      </div>
    </MyDayDragProvider>
  );
}

/** The two areas, side by side or one above the other (my-day-style.ts). */
function MyDaySections(props: {
  search: React.ReactNode;
  unscheduled: React.ReactNode;
  timeline: React.ReactNode;
}) {
  return (
    <>
      {/* Also where dragging a card unschedules it (#85). */}
      <section
        className="nextaction-my-day-unscheduled"
        aria-label={t("Unscheduled")}
        data-nextaction-my-day-drop="unscheduled"
      >
        <div className="nextaction-my-day-section-header">
          <h3 className="nextaction-my-day-section-title">
            {t("Unscheduled")}
          </h3>
          {props.search}
        </div>
        <div className="nextaction-my-day-section-body">
          {props.unscheduled}
        </div>
      </section>
      <section
        className="nextaction-my-day-timeline"
        aria-label={t("Timeline")}
      >
        <div className="nextaction-my-day-section-header">
          <h3 className="nextaction-my-day-section-title">{t("Timeline")}</h3>
        </div>
        {props.timeline}
      </section>
    </>
  );
}

/**
 * The content's key, so it starts over on a new day or after the day
 * boundary setting changed (which may leave the logical day as it is).
 */
function contentKey(day: CalendarDate, boundaryChanges: number): string {
  return `${day.year}-${day.month}-${day.day}#${boundaryChanges}`;
}

/** How many times the day boundary setting changed while the view showed. */
function useBoundaryChanges(changes: ChangeSignalSource): number {
  const [count, setCount] = React.useState(0);
  React.useEffect(
    () => changes.subscribe(() => setCount((shown) => shown + 1)),
    [changes],
  );
  return count;
}

/**
 * The My Day view. Its query starts when the view shows and stops when it
 * goes, so every showing starts from what the notes hold then.
 */
export function createMyDayView(deps: MyDayViewDeps): PanelView {
  const query = createViewQuery(() => deps.readMyDay(), deps.changes);

  function MyDayView() {
    const today = useToday(deps.today, deps.dayBoundaryChanges);
    const boundaryChanges = useBoundaryChanges(deps.dayBoundaryChanges);
    return (
      <div className="nextaction-my-day">
        <ViewHeader title={t("My Day")} />
        {/* A new day, or a new day boundary, mounts the content afresh:
            the query and the candidates read again, for today's range, and
            the timeline scrolls to the current time again. */}
        <MyDayAreas
          key={contentKey(today, boundaryChanges)}
          query={query}
          today={today}
          deps={deps}
        />
      </div>
    );
  }

  return {
    id: "my-day",
    // Right after the next actions (5), before the inbox (10) and all tasks
    // (20): the day's flow, what can be done, then today's plan (#81).
    order: 7,
    icon: "ti ti-sun",
    label: () => t("My Day"),
    component: MyDayView,
  };
}
