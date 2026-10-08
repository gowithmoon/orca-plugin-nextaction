// The inbox view (GLOSSARY: 收集箱视图, #37): every task in the inbox, in the
// order they were captured, as read-only task cards. It reads when the plugin
// panel opens and again on every task change signal (#38). Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
import type * as React from "react";
import type { ReadInbox } from "../../../application/usecases/read-inbox";
import type { CalendarDate, Task, TaskId } from "../../../domain/task/task";
import type { ChangeSignalSource } from "../../../shared/change-signal";
import { describeError } from "../../../shared/describe-error";
import { t } from "../../../shared/l10n/l10n";
import { TaskCard } from "../../components/task-card";
import { ViewHeader } from "../../components/view-header";
import {
  createViewQuery,
  useViewQuery,
  type ViewQuery,
} from "../../hooks/use-view-query";
import type { PanelView } from "../../panel/panel-views";

export interface InboxViewDeps {
  readInbox: ReadInbox;
  /** The current logical day, for dates and overdue. */
  today: () => CalendarDate;
  /** Tasks may have changed: the inbox is read again. */
  changes: ChangeSignalSource;
  /** A card was clicked: the task opens in the task panel (#40). */
  onOpenTask?: (taskId: TaskId) => void;
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

function Notice(props: {
  icon: string;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="nextaction-view-notice" role="status">
      <i className={props.icon} aria-hidden="true" />
      <div className="nextaction-view-notice-title">{props.title}</div>
      {props.detail && (
        <div className="nextaction-view-notice-detail">{props.detail}</div>
      )}
      {props.action}
    </div>
  );
}

function InboxContent(props: {
  query: ViewQuery<Task[]>;
  today: CalendarDate;
  onOpenTask?: (taskId: TaskId) => void;
}) {
  const { query, today, onOpenTask } = props;
  const state = useViewQuery(query);
  const { Button } = orca.components;

  if (state.kind === "loading") return <Placeholder />;
  if (state.kind === "paused") {
    return (
      <Notice
        icon="ti ti-player-pause"
        title={t(
          "Task features are paused. See the plugin's earlier notice or its task tag setting.",
        )}
      />
    );
  }
  if (state.kind === "failed") {
    return (
      <Notice
        icon="ti ti-alert-circle"
        title={t("Could not read the inbox: ${reason}", {
          reason: describeError(state.error),
        })}
        action={
          <Button variant="outline" onClick={() => query.reset()}>
            {t("Retry")}
          </Button>
        }
      />
    );
  }
  if (state.data.length === 0) {
    return (
      <Notice
        icon="ti ti-inbox"
        title={t("Inbox is clear")}
        detail={t("New tasks you capture appear here.")}
      />
    );
  }
  return (
    <ul className="nextaction-task-list">
      {state.data.map((task) => (
        <li key={task.id}>
          <TaskCard
            task={task}
            today={today}
            onOpen={onOpenTask && ((open) => onOpenTask(open.id))}
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
  const query = createViewQuery(() => deps.readInbox(), deps.changes);

  const useCount = () => {
    const state = useViewQuery(query);
    return state.kind === "loaded" ? state.data.length : undefined;
  };

  function InboxView() {
    const count = useCount();
    return (
      <>
        <ViewHeader title={t("Inbox")} count={count} />
        <InboxContent
          query={query}
          today={deps.today()}
          onOpenTask={deps.onOpenTask}
        />
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
