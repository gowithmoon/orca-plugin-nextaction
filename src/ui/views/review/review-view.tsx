// The review view (GLOSSARY: 回顾视图, #98): a start page with its entries,
// and "only the tasks due for review" with their list and "Back", no step
// bar. The full review (its entry, its step bar and steps, #99–#102) joins
// as another entry and another page. Its query is shared with the count in
// the navigation (the tasks due for review); it reads when the plugin panel
// opens and again on every task change signal (ADR 0007). Verified by hand
// in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  CanMarkReviewed,
  MarkReviewed,
} from "../../../application/usecases/mark-reviewed";
import type {
  DueForReviewItem,
  ReadReview,
  ReadReviewResult,
} from "../../../application/usecases/read-review";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
import type { ChangeSignalSource } from "../../../shared/change-signal";
import { t } from "../../../shared/l10n/l10n";
import { TaskListPlaceholder } from "../../components/loading-placeholder";
import { TaskCard } from "../../components/task-card";
import { ViewHeader } from "../../components/view-header";
import {
  FailedNotice,
  PausedNotice,
  ViewNotice,
} from "../../components/view-notice";
import { useMarkReviewed } from "../../hooks/use-mark-reviewed";
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
import type { OpenReviewPopup } from "../../task-panel/review-popup";
import type { ReviewPageStore } from "./review-page-store";

export interface ReviewViewDeps {
  readReview: ReadReview;
  /** A card's "Mark reviewed" (GLOSSARY: 标记已回顾). */
  markReviewed: MarkReviewed;
  /** Whether a card offers "Mark reviewed". */
  canMarkReviewed: CanMarkReviewed;
  /** A card's "Change review interval": the review popup (#103). */
  openReviewPopup: OpenReviewPopup;
  /** The current logical day, for dates and overdue. */
  today: () => CalendarDate;
  /** Tasks may have changed: the review is read again. */
  changes: ChangeSignalSource;
  /** The cards' status menu, "open in notes" and notices. */
  taskActions: TaskActionsDeps;
  /** The task menu's registrations, for a right-click on a card. */
  menuItems: () => TaskMenuItems | undefined;
  /** The page shown, kept in the plugin instance's memory. */
  page: ReviewPageStore;
}

/** One of a card's own buttons, shown like "open in notes". */
function CardButton(props: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  const { Tooltip } = orca.components;
  return (
    <Tooltip text={props.label}>
      <button
        type="button"
        className="nextaction-task-card-button nextaction-task-card-extra"
        aria-label={props.label}
        onClick={(event) => {
          // Not a click on the card: that opens the task panel.
          event.stopPropagation();
          props.onClick();
        }}
      >
        <i className={props.icon} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

/** The start page: how many tasks are due for review, and the entries. */
function ReviewStart(props: {
  query: ViewQuery<ReadReviewResult>;
  onDueForReview: () => void;
}) {
  const { Button } = orca.components;
  const state = useViewQuery(props.query);
  const total =
    state.kind === "loaded" ? state.data.steps.dueForReview.total : undefined;
  return (
    <>
      <ViewHeader title={t("Review")} />
      <div className="nextaction-review-start">
        {total !== undefined && (
          <div className="nextaction-review-start-status">
            {total === 0
              ? t("No tasks due for review")
              : t("${count} tasks due for review", { count: String(total) })}
          </div>
        )}
        {/* The entries; "Start full review" comes first once it exists. */}
        <div className="nextaction-review-entries">
          <Button variant="outline" onClick={props.onDueForReview}>
            <i className="ti ti-list-check" aria-hidden="true" />
            {t("Only tasks due for review")}
          </Button>
        </div>
      </div>
    </>
  );
}

function DueForReviewList(props: {
  query: ViewQuery<ReadReviewResult>;
  deps: ReviewViewDeps;
}) {
  const { query, deps } = props;
  const state = useViewQuery(query);
  const actions = useTaskActions(deps.taskActions);
  const markReviewed = useMarkReviewed(
    deps.markReviewed,
    deps.taskActions.notify,
  );
  const menuItems = deps.menuItems();
  const { selectedTaskId, selectTask } = usePanel();
  const menuPlace = React.useMemo(() => ({ selectTask }), [selectTask]);
  const today = deps.today();

  if (state.kind === "loading") return <TaskListPlaceholder />;
  if (state.kind === "paused") return <PausedNotice />;
  if (state.kind === "failed") {
    return (
      <FailedNotice
        error={state.error}
        message={(reason) =>
          t("Could not read the review: ${reason}", { reason })
        }
        onRetry={() => query.reset()}
      />
    );
  }
  const { items } = state.data.steps.dueForReview;
  if (items.length === 0) {
    return (
      <ViewNotice
        icon="ti ti-list-check"
        title={t("No tasks due for review")}
        detail={t(
          "Tasks with a review interval or a review-on day show here once their day comes.",
        )}
      />
    );
  }
  return (
    <ul className="nextaction-task-list">
      {items.map(({ task, kept }: DueForReviewItem) => (
        <li key={task.id}>
          <TaskCard
            task={task}
            today={today}
            actions={actions}
            menuItems={menuItems}
            menuPlace={menuPlace}
            onOpen={(open) => selectTask(open.id)}
            selected={task.id === selectedTaskId}
            kept={kept}
            // Only faded: marking reviewed or changing the plan leaves the
            // status as it was, so "Changed to" would mislead.
            keptStatusShown={false}
            buttons={
              <>
                {deps.canMarkReviewed(task) && (
                  <CardButton
                    label={t("Mark reviewed")}
                    icon="ti ti-checks"
                    onClick={() => markReviewed(task.id)}
                  />
                )}
                <CardButton
                  label={t("Change review interval")}
                  icon="ti ti-calendar"
                  onClick={() => deps.openReviewPopup(task)}
                />
              </>
            }
          />
        </li>
      ))}
    </ul>
  );
}

/** Only the tasks due for review: their list and "Back". */
function DueForReviewPage(props: {
  query: ViewQuery<ReadReviewResult>;
  deps: ReviewViewDeps;
  total: number | undefined;
  onBack: () => void;
}) {
  const { Button } = orca.components;
  return (
    <>
      <div className="nextaction-review-back">
        <Button variant="plain" onClick={props.onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" />
          {t("Back")}
        </Button>
      </div>
      <ViewHeader title={t("Tasks due for review")} count={props.total} />
      <DueForReviewList query={props.query} deps={props.deps} />
    </>
  );
}

/**
 * The review view. Its query is shared with the count in the navigation; it
 * starts when the plugin panel opens and stops when it closes, so every
 * opening starts from what the notes hold then.
 */
export function createReviewView(deps: ReviewViewDeps): PanelView {
  /**
   * The tasks listed while "only the tasks due for review" shows, each with
   * the day it was last listed under: every one stays in its place, whatever
   * was done to it, until the page is left (#98). One value serves the whole
   * view: there is at most one plugin panel.
   */
  const keep = new Map<TaskId, CalendarDate>();
  let keeping = false;
  /** Remembers where each task still due is listed, while keeping. */
  const remember = (read: ReadReviewResult) => {
    if (!keeping) return;
    for (const item of read.steps.dueForReview.items) {
      if (!item.kept) keep.set(item.task.id, item.dueOn);
    }
  };
  const query = createViewQuery(async () => {
    const read = await deps.readReview({ keep });
    remember(read);
    return read;
  }, deps.changes);

  /** Tasks due for review: kept ones are not counted. */
  const useCount = () => {
    const state = useViewQuery(query);
    return state.kind === "loaded"
      ? state.data.steps.dueForReview.total
      : undefined;
  };

  /** Starts keeping what is listed; leaving forgets it and reads again. */
  function useKeepWhileShown() {
    React.useEffect(() => {
      keeping = true;
      // What shows already, read before the page opened.
      const shown = query.current();
      if (shown.kind === "loaded") remember(shown.data);
      return () => {
        keeping = false;
        keep.clear();
        query.reload();
      };
    }, []);
  }

  function KeptDueForReviewPage(props: { onBack: () => void }) {
    useKeepWhileShown();
    const total = useCount();
    return (
      <DueForReviewPage
        query={query}
        deps={deps}
        total={total}
        onBack={props.onBack}
      />
    );
  }

  function ReviewView() {
    const page = React.useSyncExternalStore(
      deps.page.subscribe,
      deps.page.current,
    );
    if (page.kind === "dueForReview") {
      return <KeptDueForReviewPage onBack={deps.page.clear} />;
    }
    return (
      <ReviewStart
        query={query}
        onDueForReview={() => deps.page.set({ kind: "dueForReview" })}
      />
    );
  }

  return {
    id: "review",
    // After the all tasks view (20).
    order: 30,
    icon: "ti ti-list-check",
    label: () => t("Review"),
    useCount,
    component: ReviewView,
  };
}
