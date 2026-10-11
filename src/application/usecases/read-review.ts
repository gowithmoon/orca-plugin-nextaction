// Use case: read the review (GLOSSARY: 回顾), for the review view: one read
// of the task graph gives every step's list: the inbox, the next actions,
// waiting, someday (#99) and the tasks due for review (#98), and the
// summary's numbers with the moment the last full review was completed
// (#101). Later issues append the other steps to `steps`.
import {
  analyzeTaskGraph,
  type TaskGraphEntry,
} from "../../domain/blocking/task-graph";
import { isDueSoon } from "../../domain/review/due-steps";
import {
  type LookBackEntry,
  lookBack,
  lookBackStart,
} from "../../domain/review/look-back";
import { isDueForReview, reviewDueDay } from "../../domain/review/review";
import { rankByScore } from "../../domain/scoring/score";
import { isOverdue } from "../../domain/task/overdue";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import { compareDays, daysBetween } from "../../domain/time/calendar-days";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { LastFullReviewStore } from "../ports/last-full-review";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";

/** The review's steps that list tasks (GLOSSARY: 回顾), by key. */
export type ReviewStepKey = keyof ReadReviewResult["steps"];

/**
 * The tasks kept in one step's list after they left it (clarified, changed
 * status, marked reviewed, done…), each in the place it was listed in, as in
 * the inbox and next action views. Only the step it names keeps them: the
 * review view clears it on moving to another step.
 */
export type ReviewKeep =
  | {
      readonly step: DatedReviewStepKey;
      /**
       * Each with the day it was listed under: its review due day
       * (`DueForReviewItem.dueOn`) or its due date before it was changed.
       */
      readonly tasks: ReadonlyMap<TaskId, CalendarDate>;
    }
  | {
      readonly step: Exclude<ReviewStepKey, DatedReviewStepKey>;
      /** Placed by capture or by score, as the step orders its own. */
      readonly tasks: ReadonlySet<TaskId>;
    };

/**
 * The steps ordered by a day, whose kept tasks keep the day they were
 * listed under: the tasks due for review, the overdue tasks and the ones due
 * in the next 7 days.
 */
export const datedReviewStepKeys = [
  "dueForReview",
  "overdue",
  "dueSoon",
] as const;
export type DatedReviewStepKey = (typeof datedReviewStepKeys)[number];

/** Whether `step` keeps its tasks with the day they were listed under. */
export function isDatedReviewStep(
  step: ReviewStepKey,
): step is DatedReviewStepKey {
  return (datedReviewStepKeys as readonly string[]).includes(step);
}

/** Whether `keep` keeps its tasks with the day they were listed under. */
function isDatedKeep(
  keep: ReviewKeep,
): keep is Extract<ReviewKeep, { step: DatedReviewStepKey }> {
  return isDatedReviewStep(keep.step);
}

export interface ReadReviewOptions {
  readonly keep?: ReviewKeep;
}

/** A task in a step's list. */
export interface ReviewItem {
  readonly task: Task;
  /** Listed only because it is kept: it has left this step. */
  readonly kept: boolean;
}

/** One step's list. */
export interface ReviewStepRead<Item extends ReviewItem = ReviewItem> {
  readonly items: readonly Item[];
  /** How many tasks belong to the step; kept ones are not counted. */
  readonly total: number;
}

/** A task in a step ordered by its due date (the overdue tasks, due soon). */
export interface DatedReviewItem extends ReviewItem {
  /**
   * Its due date, which the list is ordered by; for a kept task, the due
   * date it was listed under before it was changed.
   */
  readonly dueOn: CalendarDate;
}

/**
 * Look back (GLOSSARY: 回看过去), since the last full review was completed,
 * or 7 days ago without one. Its list (`items`, `total`) is the tasks
 * planned but not done: in My Day on a day from the start's logical day to
 * yesterday, and still not done since; in note order, kept ones included.
 */
export interface LookBackStepRead extends ReviewStepRead {
  /** Where look back starts: the last full review, or 7 days ago. */
  readonly since: Date;
  /**
   * Every completion and skip since the start, one each, the latest first.
   * A history that cannot be read lists none.
   */
  readonly entries: readonly LookBackEntry<Task>[];
}

/** A task in the list of tasks due for review. */
export interface DueForReviewItem extends ReviewItem {
  /**
   * The day it came due for review (its next review day or review-on day,
   * whichever is earlier), which the list is ordered by; for a kept task,
   * the day it was kept under.
   */
  readonly dueOn: CalendarDate;
}

export interface ReadReviewResult {
  /** Each step's list, by step. */
  readonly steps: {
    /** The tasks in the inbox (GLOSSARY: 收集箱), in the order they were captured. */
    readonly inbox: ReviewStepRead;
    /**
     * The next actions (GLOSSARY: 下一步行动), the highest score first, as
     * the next action view lists them without a filter.
     */
    readonly nextActions: ReviewStepRead;
    /** The waiting tasks (GLOSSARY: 等待中), the highest score first. */
    readonly waiting: ReviewStepRead;
    /** The someday tasks (GLOSSARY: 将来/也许), the highest score first. */
    readonly someday: ReviewStepRead;
    /**
     * Look back (GLOSSARY: 回看过去), since the last full review was
     * completed, or 7 days ago without one.
     */
    readonly lookBack: LookBackStepRead;
    /** The overdue tasks (GLOSSARY: 截止日期), the earliest due date first. */
    readonly overdue: ReviewStepRead<DatedReviewItem>;
    /**
     * The tasks due in the next 7 days (GLOSSARY: 完整回顾): due today to
     * today plus 6, not overdue, the earliest due date first.
     */
    readonly dueSoon: ReviewStepRead<DatedReviewItem>;
    /**
     * The tasks due for review (GLOSSARY: 需要回顾), the earliest due first;
     * its total is the navigation's count.
     */
    readonly dueForReview: ReviewStepRead<DueForReviewItem>;
  };
  /** The summary's numbers: how the system stands now. */
  readonly summary: {
    /** The completions in look back (skips not counted). */
    readonly completedInLookBack: number;
    /** The tasks left in the inbox. */
    readonly inbox: number;
    /** The overdue tasks. */
    readonly overdue: number;
    /** The tasks due for review. */
    readonly dueForReview: number;
  };
  /**
   * When the last full review (GLOSSARY: 完整回顾) was completed, and how
   * many logical days ago: 0 on the same logical day. `null` when none was
   * completed or its moment is lost (it is discardable).
   */
  readonly lastFullReview: {
    readonly at: Date;
    readonly daysAgo: number;
  } | null;
}

/** Reads the review. Errors are thrown as they are. */
export type ReadReview = (
  options?: ReadReviewOptions,
) => Promise<ReadReviewResult>;

/** Capture order: the earliest created first, the lower ID on a tie. */
function byCapture(a: Task, b: Task): number {
  return a.created.getTime() - b.created.getTime() || a.id - b.id;
}

export function createReadReview(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
  lastFullReview: LastFullReviewStore;
}): ReadReview {
  return async (options = {}) => {
    const boundary = deps.dayBoundary.current();
    const today = logicalDay(deps.clock.now(), boundary);
    const [snapshot, lastFullReviewAt] = await Promise.all([
      deps.repository.readTaskGraph(),
      deps.lastFullReview.read(),
    ]);
    const { tasks } = snapshot;
    const graph = analyzeTaskGraph(snapshot, {
      today,
      previewDays: deps.startPreviewDays.current(),
    });
    const keep = options.keep;
    /** The tasks kept in `step`; none for any other step. */
    const keptIn = (step: ReviewStepKey): ReadonlySet<TaskId> =>
      keep?.step === step && !isDatedKeep(keep) ? keep.tasks : new Set();
    /** The day `id` was listed under in `step`, when kept there. */
    const keptOnDay = (
      step: DatedReviewStepKey,
      id: TaskId,
    ): CalendarDate | undefined =>
      keep?.step === step && isDatedKeep(keep) ? keep.tasks.get(id) : undefined;
    const items: DueForReviewItem[] = [];
    let total = 0;
    // Only tasks in the snapshot: a block that is no longer a task is not
    // listed, kept or not.
    for (const { task } of tasks) {
      const dueOn =
        isDueForReview(task, today) && task.review.kind === "plan"
          ? reviewDueDay(task.review.plan)
          : null;
      if (dueOn) {
        total++;
        items.push({ task, kept: false, dueOn });
        continue;
      }
      const keptOn = keptOnDay("dueForReview", task.id);
      if (keptOn) items.push({ task, kept: true, dueOn: keptOn });
    }
    // Stable: the same day keeps the notes' order.
    items.sort((a, b) => compareDays(a.dueOn, b.dueOn));
    /**
     * A step ordered by score: the graph entries `belongs` lets in, and the
     * ones kept in `step` that it no longer does, each in its place by score.
     * Only tasks in the snapshot: a block that is no longer a task is not
     * listed, kept or not.
     */
    const byScore = (
      step: ReviewStepKey,
      belongs: (entry: TaskGraphEntry) => boolean,
    ): ReviewStepRead => {
      const kept = keptIn(step);
      const entries = tasks
        .map(({ task }) => graph.entry(task.id))
        .filter((entry) => entry !== undefined)
        .filter((entry) => belongs(entry) || kept.has(entry.task.id));
      return {
        items: rankByScore(entries, today).map((entry) => ({
          task: entry.task,
          kept: !belongs(entry),
        })),
        total: entries.filter(belongs).length,
      };
    };
    /**
     * A step ordered by due date: the tasks `belongs` lets in, and the ones
     * kept in `step` that it no longer does, each by the due date it was
     * listed under; the earliest first, the same day keeping the notes'
     * order. Only tasks in the snapshot: a block that is no longer a task is
     * not listed, kept or not.
     */
    const byDue = (
      step: Exclude<DatedReviewStepKey, "dueForReview">,
      belongs: (task: Task) => boolean,
    ): ReviewStepRead<DatedReviewItem> => {
      const listed: DatedReviewItem[] = [];
      let count = 0;
      for (const { task } of tasks) {
        if (task.due && belongs(task)) {
          count++;
          listed.push({ task, kept: false, dueOn: task.due });
          continue;
        }
        const keptOn = keptOnDay(step, task.id);
        if (keptOn) listed.push({ task, kept: true, dueOn: keptOn });
      }
      listed.sort((a, b) => compareDays(a.dueOn, b.dueOn));
      return { items: listed, total: count };
    };
    const keptInInbox = keptIn("inbox");
    const inbox = tasks
      .map((entry) => entry.task)
      .filter((task) => task.status === "inbox" || keptInInbox.has(task.id))
      .sort(byCapture);
    const inboxTotal = inbox.filter((task) => task.status === "inbox").length;
    const since = lookBackStart(lastFullReviewAt, deps.clock.now());
    const looked = lookBack(
      tasks.map((item) => ({
        task: item.task,
        history: item.completionHistory ?? [],
        // Unreadable entries are none here, as for My Day's candidates.
        myDay: item.myDay?.kind === "readable" ? item.myDay.entries : [],
      })),
      { start: since, today, boundary },
    );
    // Kept ones (done since, through the status menu) stay in their place.
    const notDone = new Set(looked.plannedNotDone.map((task) => task.id));
    const keptInLookBack = keptIn("lookBack");
    const plannedNotDone = tasks
      .map((item) => item.task)
      .filter((task) => notDone.has(task.id) || keptInLookBack.has(task.id))
      .map((task) => ({ task, kept: !notDone.has(task.id) }));
    return {
      steps: {
        inbox: {
          items: inbox.map((task) => ({
            task,
            kept: task.status !== "inbox",
          })),
          total: inboxTotal,
        },
        nextActions: byScore("nextActions", (entry) => entry.nextAction),
        waiting: byScore("waiting", (entry) => entry.task.status === "waiting"),
        someday: byScore("someday", (entry) => entry.task.status === "someday"),
        lookBack: {
          since,
          entries: looked.entries,
          items: plannedNotDone,
          total: notDone.size,
        },
        overdue: byDue("overdue", (task) => isOverdue(task, today)),
        dueSoon: byDue("dueSoon", (task) => isDueSoon(task, today)),
        dueForReview: { items, total },
      },
      summary: {
        completedInLookBack: looked.entries.filter(
          (entry) => entry.kind === "completion",
        ).length,
        inbox: inboxTotal,
        overdue: tasks.filter(({ task }) => isOverdue(task, today)).length,
        dueForReview: total,
      },
      lastFullReview: lastFullReviewAt && {
        at: lastFullReviewAt,
        daysAgo: daysBetween(logicalDay(lastFullReviewAt, boundary), today),
      },
    };
  };
}
