// The review view (GLOSSARY: 回顾视图, #98, #99): a start page with its
// entries; a full review (GLOSSARY: 完整回顾) with its step bar, "Previous /
// Next" and each step's list; and "only the tasks due for review" with their
// list and "Back", no step bar. The steps come from review-steps.ts in the
// glossary's order; the ones not built yet show unavailable. Its query is
// shared with the count in the navigation (the tasks due for review); it
// reads when the plugin panel opens and again on every task change signal
// (ADR 0007). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { AddToMyDay } from "../../../application/usecases/add-to-my-day";
import type { DropTask } from "../../../application/usecases/drop-task";
import type {
  CanMarkReviewed,
  MarkReviewed,
} from "../../../application/usecases/mark-reviewed";
import {
  isDatedReviewStep,
  type ReadReview,
  type ReadReviewResult,
  type ReviewKeep,
  type ReviewStepKey,
} from "../../../application/usecases/read-review";
import type { CalendarDate, Task, TaskId } from "../../../domain/task/task";
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
import { useReviewCardActions } from "../../hooks/use-review-card-actions";
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
import type { ReviewPage, ReviewPageStore } from "./review-page-store";
import {
  adjacentStep,
  cardActions,
  dueForReviewList,
  type FullReviewStepId,
  firstStep,
  fullReviewStep,
  fullReviewSteps,
  type ReviewCardAction,
  type ReviewStepList,
} from "./review-steps";

export interface ReviewViewDeps {
  readReview: ReadReview;
  /** A card's "Mark reviewed" (GLOSSARY: 标记已回顾). */
  markReviewed: MarkReviewed;
  /** Whether a card offers "Mark reviewed". */
  canMarkReviewed: CanMarkReviewed;
  /** A card's "Change review interval": the review popup (#103). */
  openReviewPopup: OpenReviewPopup;
  /** A card's "Add to My Day". */
  addToMyDay: AddToMyDay;
  /** A card's "Drop" (someday). */
  dropTask: DropTask;
  /** Every step's "Create task": the quick capture popup. */
  openQuickCapture: () => void;
  /** The current logical day, for dates and overdue. */
  today: () => CalendarDate;
  /** The current time, for when a full review starts. */
  now: () => Date;
  /** Tasks may have changed: the review is read again. */
  changes: ChangeSignalSource;
  /** The cards' status menu, "open in notes" and notices. */
  taskActions: TaskActionsDeps;
  /** The task menu's registrations, for a right-click on a card. */
  menuItems: () => TaskMenuItems | undefined;
  /** The page shown and a full review's progress, in memory. */
  page: ReviewPageStore;
}

/** One of a card's own buttons, shown like "open in notes". */
function CardButton(props: {
  label: string;
  icon: string;
  onClick: () => void;
  dangerous?: boolean;
}) {
  const { Tooltip } = orca.components;
  return (
    <Tooltip text={props.label}>
      <button
        type="button"
        className="nextaction-task-card-button nextaction-task-card-extra"
        data-dangerous={props.dangerous || undefined}
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

/** What each card action does, and when a card offers it. */
function useCardActionButtons(deps: ReviewViewDeps) {
  const actions = useTaskActions(deps.taskActions);
  const markReviewed = useMarkReviewed(
    deps.markReviewed,
    deps.taskActions.notify,
  );
  const review = useReviewCardActions({
    addToMyDay: deps.addToMyDay,
    dropTask: deps.dropTask,
    notify: deps.taskActions.notify,
  });
  /** The button for `action` on `task`; `null` when it is not offered. */
  const button = (action: ReviewCardAction, task: Task) => {
    switch (action) {
      case "markReviewed":
        return deps.canMarkReviewed(task) ? (
          <CardButton
            key={action}
            label={t("Mark reviewed")}
            icon="ti ti-checks"
            onClick={() => markReviewed(task.id)}
          />
        ) : null;
      case "addToMyDay":
        return (
          <CardButton
            key={action}
            label={t("Add to My Day")}
            icon="ti ti-sun"
            onClick={() => review.addToMyDay(task.id)}
          />
        );
      // A kept card that changed already offers nothing the status menu
      // would not: undo, or the status menu, changes it back.
      case "backToTodo":
        return task.status === "waiting" ? (
          <CardButton
            key={action}
            label={t("Back to todo")}
            icon="ti ti-arrow-back-up"
            onClick={() => actions.changeStatus(task, "todo")}
          />
        ) : null;
      case "activate":
        return task.status === "someday" ? (
          <CardButton
            key={action}
            label={t("Activate")}
            icon="ti ti-player-play"
            onClick={() => actions.changeStatus(task, "todo")}
          />
        ) : null;
      case "drop":
        return (
          <CardButton
            key={action}
            label={t("Drop task")}
            icon="ti ti-trash"
            dangerous
            onClick={() => review.drop(task.id)}
          />
        );
      case "changeReviewInterval":
        return (
          <CardButton
            key={action}
            label={t("Change review interval")}
            icon="ti ti-calendar"
            onClick={() => deps.openReviewPopup(task)}
          />
        );
    }
  };
  return { actions, button };
}

/** A step's list: its cards with the step's actions, or what an empty one says. */
function StepList(props: {
  query: ViewQuery<ReadReviewResult>;
  deps: ReviewViewDeps;
  list: ReviewStepList;
}) {
  const { query, deps, list } = props;
  const state = useViewQuery(query);
  const { actions, button } = useCardActionButtons(deps);
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
  const { items } = state.data.steps[list.key];
  if (items.length === 0) {
    return (
      <ViewNotice
        icon={list.emptyIcon}
        title={list.empty()}
        detail={list.emptyDetail?.()}
      />
    );
  }
  const shown = cardActions(list);
  return (
    <ul className="nextaction-task-list">
      {items.map(({ task, kept }) => (
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
            keptStatusShown={list.keptStatusShown}
            buttons={shown.map((action) => button(action, task))}
          />
        </li>
      ))}
    </ul>
  );
}

/** "Create task" beside a step's title: the quick capture popup. */
function CaptureButton(props: { onClick: () => void }) {
  const { Button, Tooltip } = orca.components;
  return (
    <Tooltip text={t("Create task")}>
      <Button
        variant="plain"
        className="nextaction-review-capture"
        aria-label={t("Create task")}
        onClick={props.onClick}
      >
        <i className="ti ti-plus" aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}

/** The start page: how many tasks are due for review, and the entries. */
function ReviewStart(props: {
  query: ViewQuery<ReadReviewResult>;
  onFullReview: () => void;
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
        <div className="nextaction-review-entries">
          <Button variant="solid" onClick={props.onFullReview}>
            <i className="ti ti-route" aria-hidden="true" />
            {t("Start full review")}
          </Button>
          <Button variant="outline" onClick={props.onDueForReview}>
            <i className="ti ti-list-check" aria-hidden="true" />
            {t("Only tasks due for review")}
          </Button>
        </div>
      </div>
    </>
  );
}

/** The step bar: every step in order, numbered; the ones not built disabled. */
function StepBar(props: {
  current: FullReviewStepId;
  opened: readonly FullReviewStepId[];
  onOpen: (step: FullReviewStepId) => void;
}) {
  const { Tooltip } = orca.components;
  return (
    <nav className="nextaction-review-steps" aria-label={t("Review steps")}>
      <ol>
        {fullReviewSteps.map((step, index) => {
          const available = step.list !== undefined;
          const current = step.id === props.current;
          const opened = props.opened.includes(step.id);
          const item = (
            <button
              type="button"
              className="nextaction-review-step"
              aria-current={current ? "step" : undefined}
              data-opened={(opened && !current) || undefined}
              disabled={!available}
              onClick={() => props.onOpen(step.id)}
            >
              <span className="nextaction-review-step-number">
                {opened && !current ? (
                  <i className="ti ti-check" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="nextaction-review-step-label">
                {step.label()}
              </span>
              {opened && !current && (
                <span className="nextaction-visually-hidden">
                  {t("(opened)")}
                </span>
              )}
            </button>
          );
          return (
            <li key={step.id}>
              {available ? (
                item
              ) : (
                <Tooltip text={t("Not available yet")}>
                  <span>{item}</span>
                </Tooltip>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Only the tasks due for review: their list and "Back". */
function DueForReviewPage(props: {
  query: ViewQuery<ReadReviewResult>;
  deps: ReviewViewDeps;
  total: number | undefined;
  onBack: () => void;
}) {
  return (
    <>
      <BackButton onClick={props.onBack} />
      <div className="nextaction-review-title">
        <ViewHeader title={t("Tasks due for review")} count={props.total} />
        <CaptureButton onClick={props.deps.openQuickCapture} />
      </div>
      <StepList
        query={props.query}
        deps={props.deps}
        list={dueForReviewList()}
      />
    </>
  );
}

function BackButton(props: { onClick: () => void }) {
  const { Button } = orca.components;
  return (
    <div className="nextaction-review-back">
      <Button variant="plain" onClick={props.onClick}>
        <i className="ti ti-arrow-left" aria-hidden="true" />
        {t("Back")}
      </Button>
    </div>
  );
}

/** A full review's page: the step bar, the step's list, "Previous / Next". */
function FullReviewPage(props: {
  query: ViewQuery<ReadReviewResult>;
  deps: ReviewViewDeps;
  page: Extract<ReviewPage, { kind: "full" }>;
  onOpen: (step: FullReviewStepId) => void;
  onLeave: () => void;
}) {
  const { query, deps, page, onOpen } = props;
  const { Button } = orca.components;
  const state = useViewQuery(query);
  const step = fullReviewStep(page.step);
  const previous = adjacentStep(page.step, -1);
  const next = adjacentStep(page.step, 1);
  const total =
    state.kind === "loaded" && step.list
      ? state.data.steps[step.list.key].total
      : undefined;
  return (
    <>
      <BackButton onClick={props.onLeave} />
      <StepBar current={page.step} opened={page.opened} onOpen={onOpen} />
      <div className="nextaction-review-title">
        <ViewHeader title={step.label()} count={total} countInEveryTier />
        <CaptureButton onClick={deps.openQuickCapture} />
      </div>
      {step.list && <StepList query={query} deps={deps} list={step.list} />}
      <div className="nextaction-review-pager">
        <Button
          variant="outline"
          disabled={!previous}
          onClick={() => previous && onOpen(previous.id)}
        >
          <i className="ti ti-chevron-left" aria-hidden="true" />
          {t("Previous")}
        </Button>
        <Button
          variant="outline"
          disabled={!next}
          onClick={() => next && onOpen(next.id)}
        >
          {t("Next")}
          <i className="ti ti-chevron-right" aria-hidden="true" />
        </Button>
      </div>
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
   * The tasks listed in the step shown, each with the day it was listed
   * under for the tasks due for review: every one stays in its place,
   * whatever was done to it, until the step or the page is left (#98,
   * #99). One value serves the whole view: there is at most one plugin
   * panel.
   */
  let keeping: ReviewStepKey | undefined;
  const keep = new Map<TaskId, CalendarDate | null>();
  /** What the read keeps: the step shown's tasks. */
  const keepOption = (): ReviewKeep | undefined => {
    if (keeping === undefined) return undefined;
    if (isDatedReviewStep(keeping)) {
      const tasks = new Map<TaskId, CalendarDate>();
      for (const [id, on] of keep) if (on) tasks.set(id, on);
      return { step: keeping, tasks };
    }
    return { step: keeping, tasks: new Set(keep.keys()) };
  };
  /** Remembers where each task still in the step is listed, while keeping. */
  const remember = (read: ReadReviewResult) => {
    if (keeping === undefined) return;
    if (isDatedReviewStep(keeping)) {
      for (const item of read.steps[keeping].items) {
        if (!item.kept) keep.set(item.task.id, item.dueOn);
      }
      return;
    }
    for (const item of read.steps[keeping].items) {
      if (!item.kept) keep.set(item.task.id, null);
    }
  };
  const query = createViewQuery(async () => {
    const read = await deps.readReview({ keep: keepOption() });
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

  /**
   * Keeps what `step` lists while it shows; leaving it (another step, the
   * page, the view) forgets it and reads again.
   */
  function useKeepWhileShown(step: ReviewStepKey | undefined) {
    React.useEffect(() => {
      if (step === undefined) return;
      keeping = step;
      // What shows already, read before the step opened.
      const shown = query.current();
      if (shown.kind === "loaded") remember(shown.data);
      return () => {
        keeping = undefined;
        keep.clear();
        query.reload();
      };
    }, [step]);
  }

  function KeptDueForReviewPage(props: { onBack: () => void }) {
    useKeepWhileShown("dueForReview");
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

  function KeptFullReviewPage(props: {
    page: Extract<ReviewPage, { kind: "full" }>;
  }) {
    const { page } = props;
    useKeepWhileShown(fullReviewStep(page.step).list?.key);
    const open = (step: FullReviewStepId) => {
      if (step === page.step) return;
      deps.page.set({
        ...page,
        step,
        opened: page.opened.includes(step)
          ? page.opened
          : [...page.opened, step],
      });
    };
    return (
      <FullReviewPage
        query={query}
        deps={deps}
        page={page}
        onOpen={open}
        onLeave={deps.page.clear}
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
    if (page.kind === "full") return <KeptFullReviewPage page={page} />;
    return (
      <ReviewStart
        query={query}
        onFullReview={() => {
          const step = firstStep();
          deps.page.set({
            kind: "full",
            step,
            opened: [step],
            startedAt: deps.now(),
          });
        }}
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
