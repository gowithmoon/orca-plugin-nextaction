// The My Day view (GLOSSARY: 我的一天视图, #83): the tasks in today's My Day,
// in the unscheduled area, with a search box on top to add more. The layout
// shell holds the unscheduled area and the timeline (GLOSSARY: 时间轴) side by
// side or one above the other, by the view's own width (not the plugin
// panel's tier); the timeline is left empty until #84 fills it. Between the
// next actions and all tasks in the navigation, with no count there. It reads
// when the plugin panel opens and again on every task change signal (ADR
// 0007); open across the day boundary, it moves on to the new day. Verified
// by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { AddToMyDay } from "../../../application/usecases/add-to-my-day";
import type {
  MyDayItem,
  ReadMyDay,
  TodaysMyDay,
} from "../../../application/usecases/read-my-day";
import type {
  MyDayCandidate,
  ReadMyDayCandidates,
} from "../../../application/usecases/read-my-day-candidates";
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

export interface MyDayViewDeps {
  readMyDay: ReadMyDay;
  readMyDayCandidates: ReadMyDayCandidates;
  addToMyDay: AddToMyDay;
  /** The current logical day, for dates, overdue and moving to a new day. */
  today: () => CalendarDate;
  /** Tasks may have changed: My Day and the candidates are read again. */
  changes: ChangeSignalSource;
  /** The cards' status menu, "open in notes" and notices. */
  taskActions: TaskActionsDeps;
  /** The task menu's registrations, for a right-click on a card. */
  menuItems: () => TaskMenuItems | undefined;
}

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

/**
 * What the unscheduled area lists of a read. Until the timeline (#84) shows
 * the scheduled tasks, they are listed here too, after the unscheduled ones.
 */
function shownItems(read: TodaysMyDay): readonly MyDayItem[] {
  return [...read.unscheduled, ...read.scheduled];
}

function UnscheduledArea(props: {
  query: ViewQuery<TodaysMyDay>;
  today: CalendarDate;
  deps: MyDayViewDeps;
}) {
  const { query, today, deps } = props;
  const state = useViewQuery(query);
  const actions = useTaskActions(deps.taskActions);
  const menuItems = deps.menuItems();
  const { selectedTaskId, selectTask } = usePanel();
  const menuPlace = React.useMemo(() => ({ selectTask }), [selectTask]);

  if (state.kind === "loading") return <Placeholder />;
  if (state.kind === "paused") return <PausedNotice />;
  if (state.kind === "failed") {
    return (
      <FailedNotice
        error={state.error}
        message={(reason) => t("Could not read My Day: ${reason}", { reason })}
        onRetry={() => query.reset()}
      />
    );
  }
  const items = shownItems(state.data);
  return (
    <>
      <AddSearch deps={deps} />
      {items.length === 0 ? (
        <ViewNotice
          icon="ti ti-sun"
          title={t("Nothing in My Day yet")}
          detail={t(
            "Search above to add a task, or choose “Add to My Day” in a task's menu.",
          )}
        />
      ) : (
        <ul className="nextaction-task-list">
          {items.map(({ task }) => (
            <li key={task.id}>
              <TaskCard
                task={task}
                today={today}
                actions={actions}
                menuItems={menuItems}
                menuPlace={menuPlace}
                onOpen={(open) => selectTask(open.id)}
                selected={task.id === selectedTaskId}
              />
            </li>
          ))}
        </ul>
      )}
    </>
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

  function MyDayContent(props: { today: CalendarDate }) {
    return (
      <div className="nextaction-my-day-layout">
        <section
          className="nextaction-my-day-unscheduled"
          aria-label={t("Unscheduled")}
        >
          <h3 className="nextaction-my-day-section-title">
            {t("Unscheduled")}
          </h3>
          <UnscheduledArea query={query} today={props.today} deps={deps} />
        </section>
        {/* The timeline's place (#84): empty for now. */}
        <section
          className="nextaction-my-day-timeline"
          aria-label={t("Timeline")}
        />
      </div>
    );
  }

  function MyDayView() {
    const today = useToday(deps.today);
    return (
      <div className="nextaction-my-day">
        <ViewHeader title={t("My Day")} />
        {/* A new day mounts the content afresh: the query and the
            candidates read again, for the new day. */}
        <MyDayContent key={dayKey(today)} today={today} />
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
