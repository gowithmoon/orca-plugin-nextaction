// The inbox view (GLOSSARY: 收集箱视图, #37): every task in the inbox, in the
// order they were captured, as task cards with their actions (#39). It reads
// when the plugin panel opens and again on every task change signal (#38).
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ReadInbox } from "../../../application/usecases/read-inbox";
import type { CalendarDate, Task, TaskId } from "../../../domain/task/task";
import type { ChangeSignalSource } from "../../../shared/change-signal";
import { t } from "../../../shared/l10n/l10n";
import { TaskCard } from "../../components/task-card";
import { ViewHeader } from "../../components/view-header";
import {
  FailedNotice,
  PausedNotice,
  ViewNotice,
} from "../../components/view-notice";
import {
  type TaskActionsDeps,
  useTaskActions,
} from "../../hooks/use-task-actions";
import {
  createViewQuery,
  useViewQuery,
  type ViewQuery,
} from "../../hooks/use-view-query";
import { usePanel } from "../../panel/panel-context";
import type { PanelView } from "../../panel/panel-views";
import type { TaskMenuItems } from "../../task-menu/menu-items";

export interface InboxViewDeps {
  readInbox: ReadInbox;
  /** The current logical day, for dates and overdue. */
  today: () => CalendarDate;
  /** Tasks may have changed: the inbox is read again. */
  changes: ChangeSignalSource;
  /** The cards' status menu and "open in notes". */
  taskActions: TaskActionsDeps;
  /** The task menu's registrations, for a right-click on a card. */
  menuItems: () => TaskMenuItems | undefined;
}

/**
 * What the list shows of a read (#35 "收集箱视图"): the inbox, plus the
 * selected task if it has left the inbox, in its place. A task kept for an
 * earlier selection is no longer shown once the selection moves on.
 */
function shownTasks(read: readonly Task[], selected: TaskId | undefined) {
  return read.filter((task) => task.status === "inbox" || task.id === selected);
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

function InboxContent(props: {
  query: ViewQuery<Task[]>;
  today: CalendarDate;
  deps: InboxViewDeps;
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
        message={(reason) =>
          t("Could not read the inbox: ${reason}", { reason })
        }
        onRetry={() => query.reset()}
      />
    );
  }
  const tasks = shownTasks(state.data, selectedTaskId);
  if (tasks.length === 0) {
    return (
      <ViewNotice
        icon="ti ti-inbox"
        title={t("Inbox is clear")}
        detail={t("New tasks you capture appear here.")}
      />
    );
  }
  return (
    <ul className="nextaction-task-list">
      {tasks.map((task) => (
        <li key={task.id}>
          <TaskCard
            task={task}
            today={today}
            actions={actions}
            menuItems={menuItems}
            menuPlace={menuPlace}
            onOpen={(open) => selectTask(open.id)}
            selected={task.id === selectedTaskId}
            kept={task.status !== "inbox"}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * The inbox view. Its query is shared with the count in the navigation; it
 * starts when the plugin panel opens and stops when it closes, so every
 * opening starts from what the notes hold then.
 */
export function createInboxView(deps: InboxViewDeps): PanelView {
  /**
   * The selected task, kept by every read while it is selected. One value
   * serves the whole view: there is at most one plugin panel.
   */
  let selected: TaskId | undefined;
  const query = createViewQuery(
    () => deps.readInbox({ keep: selected }),
    deps.changes,
  );

  /** Tasks still to clarify: a selected task that left is not counted. */
  const useCount = () => {
    const state = useViewQuery(query);
    return state.kind === "loaded"
      ? shownTasks(state.data, undefined).length
      : undefined;
  };

  function InboxView() {
    const count = useCount();
    const { selectedTaskId } = usePanel();
    // Before any read the selection may cause: effects run before the
    // change signal's debounced read.
    React.useEffect(() => {
      selected = selectedTaskId;
      return () => {
        selected = undefined;
      };
    }, [selectedTaskId]);
    return (
      <>
        <ViewHeader title={t("Inbox")} count={count} />
        <InboxContent query={query} today={deps.today()} deps={deps} />
      </>
    );
  }

  return {
    id: "inbox",
    order: 10,
    icon: "ti ti-inbox",
    label: () => t("Inbox"),
    useCount,
    component: InboxView,
  };
}
