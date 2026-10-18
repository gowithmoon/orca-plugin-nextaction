// The My Day view (GLOSSARY: 我的一天视图, #83): the tasks in today's My Day,
// in one of its layouts (GLOSSARY: 布局, #197), switched in the header, where
// a search box adds more in every layout. The timeline layout: the
// unscheduled ones in the unscheduled area, the scheduled ones on the
// timeline (GLOSSARY: 时间轴, #84); its shell holds the two side by side or
// one above the other, by the view's own width (not the plugin panel's
// tier), and fills the view's height: each area scrolls by itself. Every
// card there has a button for the schedule popup (#84). The list: all of
// today's tasks in one column by score, done and skipped ones last, with no
// schedules; the task panel beside the view when wide enough. The
// quadrants (GLOSSARY: 四象限, #198): the same tasks in four quadrants by
// their own importance and urgency, two by two or, narrow, one above the
// other, by the view's own width; no schedules, and the task panel always in
// the popup; a card dragged to another quadrant rewrites its importance or
// urgency (#199), showing there at once (my-day-matrix.tsx). Between the next actions and all
// tasks in the navigation, with no count there. It reads when the plugin
// panel opens and
// again on every task change signal (ADR 0007); open across the day boundary,
// it moves on to the new day. An unscheduled card, or a timeline card by its
// body, dragged onto a block in a note panel links the task there (#127).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { AddToMyDay } from "../../../application/usecases/add-to-my-day";
import type { LinkTaskInNote } from "../../../application/usecases/link-task-in-note";
import type { MoveToQuadrant } from "../../../application/usecases/move-to-quadrant";
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
import {
  type LayoutChoice,
  LayoutSwitch,
} from "../../components/layout-switch";
import { TaskListPlaceholder } from "../../components/loading-placeholder";
import { Select } from "../../components/popup-controls";
import { TaskCard } from "../../components/task-card";
import { taskSearchFilter } from "../../components/task-search-filter";
import { ViewHeader } from "../../components/view-header";
import { FailedNotice, PausedNotice } from "../../components/view-notice";
import { CardDragArea, useCardDrag } from "../../drag/card-drag";
import { useAddToMyDay } from "../../hooks/use-add-to-my-day";
import { useLinkTaskInNote } from "../../hooks/use-link-task-in-note";
import { useMoveToQuadrant } from "../../hooks/use-move-to-quadrant";
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
import { usePanel, useWithoutSidePane } from "../../panel/panel-context";
import type { PanelView } from "../../panel/panel-views";
import type { TaskMenuItems } from "../../task-menu/menu-items";
import {
  createMyDayDrag,
  type MyDayDrag,
  MyDayDragProvider,
  type MyDayDragSetup,
  useMyDayDrag,
} from "./my-day-drag";
import type { MyDayLayout, MyDayLayoutStore } from "./my-day-layout-store";
import { MyDayMatrix } from "./my-day-matrix";
import type { MyDayScheduleActions } from "./my-day-schedule-actions";
import { type MyDayDropWrites, useOptimisticMyDay } from "./optimistic-my-day";
import {
  createQuadrantDrag,
  type QuadrantDrag,
  QuadrantDragProvider,
  type QuadrantDragSetup,
  useQuadrantDrag,
} from "./quadrant-drag";
import type { OpenSchedulePopup } from "./schedule-popup";
import { ScheduleButton, Timeline, type TimelineCardActions } from "./timeline";

export interface MyDayViewDeps {
  readMyDay: ReadMyDay;
  readMyDayCandidates: ReadMyDayCandidates;
  addToMyDay: AddToMyDay;
  /** A card dropped on a block in a note panel links the task there (#127). */
  linkTaskInNote: LinkTaskInNote;
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
  /** A card dropped in another quadrant moves its task there (#199). */
  moveToQuadrant: MoveToQuadrant;
  /** The layout shown (#197), in memory, from the default layout setting. */
  layout: MyDayLayoutStore;
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
 * The search box in the header, shared by every layout (#197): words of a
 * task's text or search text find it (#112), choosing it adds it to today's
 * My Day, unscheduled.
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

/** Nothing in today's My Day: the same notice in every layout. */
function NothingInMyDay() {
  return (
    <div className="nextaction-my-day-unscheduled-empty" role="status">
      <span className="nextaction-my-day-unscheduled-empty-title">
        {t("Nothing in My Day yet")}
      </span>{" "}
      {t(
        "Search above to add a task, or choose “Add to My Day” in a task's menu.",
      )}
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
    return <NothingInMyDay />;
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
            project={item.project}
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
  const myDay = useMyDayDrag();
  const inPanel = React.useMemo(
    () => myDay?.target({ kind: "add", task }),
    [myDay, task],
  );
  const drag = useCardDrag(task, inPanel ? { inPanel } : {});
  return (
    <li className="nextaction-my-day-unscheduled-item" {...drag}>
      {props.children}
    </li>
  );
}

/**
 * Cards for `items` in their order, with no schedule button: the list and
 * each quadrant. Done and skipped ones faded, as in the unscheduled area.
 */
function MyDayCards(props: {
  items: readonly MyDayItem[];
  today: CalendarDate;
  deps: MyDayViewDeps;
}) {
  const { items, today, deps } = props;
  const actions = useTaskActions(deps.taskActions);
  const menuItems = deps.menuItems();
  const { selectedTaskId, selectTask } = usePanel();
  const menuPlace = React.useMemo(() => ({ selectTask }), [selectTask]);
  return (
    <ul className="nextaction-task-list">
      {items.map((item) => (
        <MyDayCardItem key={item.task.id} item={item}>
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
            project={item.project}
          />
        </MyDayCardItem>
      ))}
    </ul>
  );
}

/**
 * A list or quadrant card, dragged by a press anywhere on it onto a note
 * (#127); a quadrant card also to another quadrant (#199).
 */
function MyDayCardItem(props: { item: MyDayItem; children: React.ReactNode }) {
  const { task } = props.item;
  const quadrants = useQuadrantDrag();
  const inPanel = React.useMemo(
    () => quadrants?.target(task),
    [quadrants, task],
  );
  return (
    <li {...useCardDrag(task, inPanel ? { inPanel } : {})}>{props.children}</li>
  );
}

/**
 * The list layout (#197): all of today's tasks, highest score first, done
 * and skipped ones last and faded, as the unscheduled area shows them; no
 * schedules and no schedule button.
 */
function MyDayList(props: {
  read: TodaysMyDay;
  today: CalendarDate;
  deps: MyDayViewDeps;
}) {
  const { read, today, deps } = props;
  if (read.all.length === 0) return <NothingInMyDay />;
  return <MyDayCards items={read.all} today={today} deps={deps} />;
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

/** Each layout's icon and name in the header's switch (#197). */
const layoutChoices: Record<MyDayLayout, LayoutChoice> = {
  timeline: { icon: "ti ti-clock", label: () => t("Timeline layout") },
  list: { icon: "ti ti-list", label: () => t("List") },
  matrix: { icon: "ti ti-layout-grid", label: () => t("Eisenhower Matrix") },
};

/**
 * The header's controls and the layout shown, from one read. Loading,
 * paused and failed show once: in the unscheduled area in the timeline
 * layout, in place of the list or the quadrants in those; the timeline
 * shows once there is a read.
 */
function MyDayAreas(props: {
  query: ViewQuery<TodaysMyDay>;
  today: CalendarDate;
  deps: MyDayViewDeps;
}) {
  const { query, today, deps } = props;
  const layout = React.useSyncExternalStore(
    deps.layout.subscribe,
    deps.layout.current,
  );
  // The quadrants need the width: no side pane beside them, even in the
  // wide tier; their tasks open in the popup (#198), as on the board.
  useWithoutSidePane(layout === "matrix");
  const writeQuadrant = useMoveToQuadrant(
    deps.moveToQuadrant,
    deps.taskActions.notify,
  );
  const writes = React.useMemo<MyDayDropWrites>(
    () => ({
      schedule: deps.scheduleActions.schedule,
      unschedule: deps.scheduleActions.unschedule,
      moveToQuadrant: writeQuadrant,
    }),
    [deps.scheduleActions, writeQuadrant],
  );
  // What a drop wrote shows at once, until a read after it arrives (#85,
  // #199).
  const { shown: state, commit } = useOptimisticMyDay(
    query,
    useViewQuery(query),
    writes,
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
  // The quadrants' drag (#199), likewise.
  const matrixRoot = React.useRef<HTMLDivElement>(null);
  const quadrantSetup = React.useRef<QuadrantDragSetup>({
    root: null,
    commit,
  });
  quadrantSetup.current = { root: matrixRoot.current, commit };
  const quadrantDrag = React.useRef<QuadrantDrag>();
  quadrantDrag.current ??= createQuadrantDrag(() => ({
    ...quadrantSetup.current,
    root: matrixRoot.current,
  }));
  const linkTaskInNote = useLinkTaskInNote(
    deps.linkTaskInNote,
    deps.taskActions.notify,
  );
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
  let notice: React.ReactNode;
  if (state.kind === "loading") notice = <TaskListPlaceholder />;
  else if (state.kind === "paused") notice = <PausedNotice />;
  else if (state.kind === "failed") {
    notice = (
      <FailedNotice
        error={state.error}
        message={(reason) => t("Could not read My Day: ${reason}", { reason })}
        onRetry={() => query.reset()}
      />
    );
  } else {
    search = <AddSearch deps={deps} />;
  }

  return (
    // The cards' drag (#124); their drops in the panel are My Day's, on a
    // block in a note panel a link (#127). The add search's results are no
    // cards and are not dragged.
    <CardDragArea onNoteDrop={linkTaskInNote}>
      <div className="nextaction-toolbar nextaction-my-day-toolbar">
        <LayoutSwitch store={deps.layout} choices={layoutChoices} />
        {search}
      </div>
      {layout === "list" ? (
        <div className="nextaction-my-day-scroll">
          {read ? <MyDayList read={read} today={today} deps={deps} /> : notice}
        </div>
      ) : layout === "matrix" ? (
        <div className="nextaction-my-day-scroll">
          {!read ? (
            notice
          ) : read.all.length === 0 ? (
            <NothingInMyDay />
          ) : (
            <QuadrantDragProvider value={quadrantDrag.current}>
              <MyDayMatrix
                items={read.all}
                cards={(items) => (
                  <MyDayCards items={items} today={today} deps={deps} />
                )}
                root={matrixRoot}
              />
            </QuadrantDragProvider>
          )}
        </div>
      ) : (
        <MyDayDragProvider value={drag.current}>
          <div className="nextaction-my-day-layout" ref={root}>
            <MyDaySections
              unscheduled={
                read ? (
                  <UnscheduledList
                    read={read}
                    today={today}
                    deps={deps}
                    onSchedule={onSchedule}
                  />
                ) : (
                  notice
                )
              }
              timeline={
                read && (
                  <TimelineArea
                    read={read}
                    deps={deps}
                    onSchedule={onSchedule}
                  />
                )
              }
            />
          </div>
        </MyDayDragProvider>
      )}
    </CardDragArea>
  );
}

/**
 * The timeline layout's two areas, side by side or one above the other
 * (my-day-style.ts).
 */
function MyDaySections(props: {
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
