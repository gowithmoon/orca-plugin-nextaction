// The My Day view (GLOSSARY: 我的一天视图, #83): the tasks in today's My Day,
// the unscheduled ones in the unscheduled area, with a search box on top to
// add more, the scheduled ones on the timeline (GLOSSARY: 时间轴, #84). The
// layout shell holds the two side by side or one above the other, by the
// view's own width (not the plugin panel's tier). Every card has a button for
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
import { TaskCard } from "../../components/task-card";
import { ViewHeader } from "../../components/view-header";
import {
  FailedNotice,
  PausedNotice,
  ViewNotice,
} from "../../components/view-notice";
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
  /** The cards' status menu, "open in notes" and notices. */
  taskActions: TaskActionsDeps;
  /** The task menu's registrations, for a right-click on a card. */
  menuItems: () => TaskMenuItems | undefined;
  /** Opens the schedule popup (#84). */
  openSchedulePopup: OpenSchedulePopup;
}

/** A card's task and, on the timeline, its schedule: what the popup opens on. */
type ScheduleTarget = MyDayItem & { readonly schedule?: MyDaySchedule };

function Placeholder() {
  const { Skeleton } = orca.components;
  return (
    <div
      className="nextaction-task-list"
      role="status"
      aria-label={t("Loading tasks")}
    >
      {[0, 1, 2].map((key) => (
        <div key={key} className="nextaction-task-card-placeholder">
          <Skeleton />
        </div>
      ))}
    </div>
  );
}

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
 * The search box: part of a task's text finds it, choosing it adds it to
 * today's My Day, unscheduled. Orca's `Select` matches the text typed
 * anywhere in the label (and its pinyin).
 */
function AddSearch(props: { deps: MyDayViewDeps }) {
  const { deps } = props;
  const { Select } = orca.components;
  const candidates = useMyDayCandidates(
    deps.readMyDayCandidates,
    deps.changes,
    deps.taskActions.notify,
  );
  const add = useAddToMyDay(deps.addToMyDay, deps.taskActions.notify);
  return (
    <div className="nextaction-my-day-search">
      <Select
        selected={[]}
        options={candidateOptions(candidates)}
        filter={true}
        filterPlaceholder={t("Search tasks")}
        placeholder={t("Add a task to My Day")}
        width="100%"
        alignment="left"
        pre={<i className="ti ti-plus" aria-hidden="true" />}
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
  if (items.length === 0 && read.scheduled.length === 0) {
    return (
      <ViewNotice
        icon="ti ti-sun"
        title={t("Nothing in My Day yet")}
        detail={t(
          "Search above to add a task, or choose “Add to My Day” in a task's menu.",
        )}
      />
    );
  }
  if (items.length === 0) {
    return (
      <div className="nextaction-my-day-all-scheduled">
        {t("Everything in My Day is scheduled.")}
      </div>
    );
  }
  return (
    <ul className="nextaction-task-list">
      {items.map((item) => (
        <li key={item.task.id}>
          <TaskCard
            task={item.task}
            today={today}
            actions={actions}
            menuItems={menuItems}
            menuPlace={menuPlace}
            onOpen={(open) => selectTask(open.id)}
            selected={item.task.id === selectedTaskId}
            buttons={<ScheduleButton onClick={() => onSchedule(item)} />}
          />
        </li>
      ))}
    </ul>
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
  const state = useViewQuery(query);
  const read = state.kind === "loaded" ? state.data : undefined;
  const range = read?.range;
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

  let unscheduled: React.ReactNode;
  if (state.kind === "loading") unscheduled = <Placeholder />;
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
    unscheduled = (
      <>
        <AddSearch deps={deps} />
        <UnscheduledList
          read={state.data}
          today={today}
          deps={deps}
          onSchedule={onSchedule}
        />
      </>
    );
  }

  return (
    <div className="nextaction-my-day-layout">
      {/* Also where dragging a card unschedules it (#85). */}
      <section
        className="nextaction-my-day-unscheduled"
        aria-label={t("Unscheduled")}
        data-nextaction-my-day-drop="unscheduled"
      >
        <h3 className="nextaction-my-day-section-title">{t("Unscheduled")}</h3>
        {unscheduled}
      </section>
      <section
        className="nextaction-my-day-timeline"
        aria-label={t("Timeline")}
      >
        <h3 className="nextaction-my-day-section-title">{t("Timeline")}</h3>
        {read && (
          <TimelineArea read={read} deps={deps} onSchedule={onSchedule} />
        )}
      </section>
    </div>
  );
}

/** A day's key, so the content starts over on a new day. */
function dayKey(day: CalendarDate): string {
  return `${day.year}-${day.month}-${day.day}`;
}

/**
 * The My Day view. Its query starts when the view shows and stops when it
 * goes, so every showing starts from what the notes hold then.
 */
export function createMyDayView(deps: MyDayViewDeps): PanelView {
  const query = createViewQuery(() => deps.readMyDay(), deps.changes);

  function MyDayView() {
    const today = useToday(deps.today);
    return (
      <div className="nextaction-my-day">
        <ViewHeader title={t("My Day")} />
        {/* A new day mounts the content afresh: the query and the
            candidates read again, for the new day, and the timeline scrolls
            to the current time again. */}
        <MyDayAreas
          key={dayKey(today)}
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
