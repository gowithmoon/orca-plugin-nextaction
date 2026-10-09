// The next action view (GLOSSARY: 下一步行动视图, #53): the tasks that can be
// done now, highest score first, as task cards with their actions. First in
// the navigation, so the plugin panel opens on it. It reads when the plugin
// panel opens and again on every task change signal (ADR 0007). Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  NextActionItem,
  NextActionsRead,
  ReadNextActions,
} from "../../../application/usecases/read-next-actions";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
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

export interface NextActionViewDeps {
  readNextActions: ReadNextActions;
  /** The current logical day, for dates and overdue. */
  today: () => CalendarDate;
  /** Tasks may have changed: the next actions are read again. */
  changes: ChangeSignalSource;
  /** The cards' status menu and "open in notes". */
  taskActions: TaskActionsDeps;
  /** The task menu's registrations, for a right-click on a card. */
  menuItems: () => TaskMenuItems | undefined;
}

/**
 * What the list shows of a read: the next actions, plus the selected task if
 * it has left them, in its place. A task kept for an earlier selection is no
 * longer shown once the selection moves on.
 */
function shownItems(
  read: NextActionsRead,
  selected: TaskId | undefined,
): NextActionItem[] {
  return read.items.filter(
    (item) => item.nextAction || item.task.id === selected,
  );
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

function NextActionContent(props: {
  query: ViewQuery<NextActionsRead>;
  today: CalendarDate;
  deps: NextActionViewDeps;
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
          t("Could not read the next actions: ${reason}", { reason })
        }
        onRetry={() => query.reset()}
      />
    );
  }
  const items = shownItems(state.data, selectedTaskId);
  if (items.length === 0) {
    return (
      <ViewNotice
        icon="ti ti-player-play"
        title={t("Nothing to do right now")}
        detail={t(
          "Tasks to do or in progress show here once nothing blocks them and their start day has come.",
        )}
      />
    );
  }
  return (
    <ul className="nextaction-task-list">
      {items.map(({ task, nextAction }) => (
        <li key={task.id}>
          <TaskCard
            task={task}
            today={today}
            actions={actions}
            menuItems={menuItems}
            menuPlace={menuPlace}
            onOpen={(open) => selectTask(open.id)}
            selected={task.id === selectedTaskId}
            kept={!nextAction}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * The next action view. Its query is shared with the count in the
 * navigation; it starts when the plugin panel opens and stops when it
 * closes, so every opening starts from what the notes hold then.
 */
export function createNextActionView(deps: NextActionViewDeps): PanelView {
  /**
   * The selected task, kept by every read while it is selected. One value
   * serves the whole view: there is at most one plugin panel.
   */
  let selected: TaskId | undefined;
  const query = createViewQuery(
    () => deps.readNextActions({ keep: selected }),
    deps.changes,
  );

  /** How many next actions there are: a selected task that left is not counted. */
  const useCount = () => {
    const state = useViewQuery(query);
    return state.kind === "loaded" ? state.data.total : undefined;
  };

  function NextActionView() {
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
        <ViewHeader title={t("Next actions")} count={count} />
        <NextActionContent query={query} today={deps.today()} deps={deps} />
      </>
    );
  }

  return {
    id: "next-action",
    // Before the inbox (10): first in the navigation, and the view the
    // plugin panel opens on.
    order: 5,
    icon: "ti ti-player-play",
    label: () => t("Next actions"),
    useCount,
    component: NextActionView,
  };
}
