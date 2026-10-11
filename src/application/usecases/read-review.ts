// Use case: read the review (GLOSSARY: 回顾), for the review view: one read
// of the task graph gives every step's list: the inbox, the next actions,
// waiting, someday (#99) and the tasks due for review (#98). Later issues
// append the other steps to `steps`, and the summary's numbers, beside it.
import {
  analyzeTaskGraph,
  type TaskGraphEntry,
} from "../../domain/blocking/task-graph";
import { isDueForReview, reviewDueDay } from "../../domain/review/review";
import { rankByScore } from "../../domain/scoring/score";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import { compareDays } from "../../domain/time/calendar-days";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
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
      readonly step: "dueForReview";
      /**
       * Each with the review due day it was listed under
       * (`DueForReviewItem.dueOn`).
       */
      readonly tasks: ReadonlyMap<TaskId, CalendarDate>;
    }
  | {
      readonly step: Exclude<ReviewStepKey, "dueForReview">;
      /** Placed by capture or by score, as the step orders its own. */
      readonly tasks: ReadonlySet<TaskId>;
    };

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
     * The tasks due for review (GLOSSARY: 需要回顾), the earliest due first;
     * its total is the navigation's count.
     */
    readonly dueForReview: ReviewStepRead<DueForReviewItem>;
  };
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
}): ReadReview {
  return async (options = {}) => {
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const snapshot = await deps.repository.readTaskGraph();
    const { tasks } = snapshot;
    const graph = analyzeTaskGraph(snapshot, {
      today,
      previewDays: deps.startPreviewDays.current(),
    });
    const keep = options.keep;
    /** The tasks kept in `step`; none for any other step. */
    const keptIn = (step: ReviewStepKey): ReadonlySet<TaskId> =>
      keep?.step === step && keep.step !== "dueForReview"
        ? keep.tasks
        : new Set();
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
      const keptOn =
        keep?.step === "dueForReview" ? keep.tasks.get(task.id) : undefined;
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
    const keptInInbox = keptIn("inbox");
    const inbox = tasks
      .map((entry) => entry.task)
      .filter((task) => task.status === "inbox" || keptInInbox.has(task.id))
      .sort(byCapture);
    return {
      steps: {
        inbox: {
          items: inbox.map((task) => ({
            task,
            kept: task.status !== "inbox",
          })),
          total: inbox.filter((task) => task.status === "inbox").length,
        },
        nextActions: byScore("nextActions", (entry) => entry.nextAction),
        waiting: byScore("waiting", (entry) => entry.task.status === "waiting"),
        someday: byScore("someday", (entry) => entry.task.status === "someday"),
        dueForReview: { items, total },
      },
    };
  };
}
