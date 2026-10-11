// Use case: read the review (GLOSSARY: 回顾), for the review view: one read
// of the task graph gives every step's list. Step 9 builds it step by step:
// this first version lists the tasks due for review (#98); later issues
// append the other steps to `steps`, and the summary's numbers, beside it.
import { isDueForReview, reviewDueDay } from "../../domain/review/review";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import { compareDays } from "../../domain/time/calendar-days";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";

export interface ReadReviewOptions {
  /**
   * Tasks kept in the list of tasks due for review after they stopped being
   * due (marked reviewed, their plan changed, done), each in the place it was
   * listed under: the review due day it had then (`DueForReviewItem.dueOn`).
   * As in the inbox and next action views.
   */
  readonly keep?: ReadonlyMap<TaskId, CalendarDate>;
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

export function createReadReview(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): ReadReview {
  return async (options = {}) => {
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const { tasks } = await deps.repository.readTaskGraph();
    const keep = options.keep ?? new Map<TaskId, CalendarDate>();
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
      const keptOn = keep.get(task.id);
      if (keptOn) items.push({ task, kept: true, dueOn: keptOn });
    }
    // Stable: the same day keeps the notes' order.
    items.sort((a, b) => compareDays(a.dueOn, b.dueOn));
    return { steps: { dueForReview: { items, total } } };
  };
}
