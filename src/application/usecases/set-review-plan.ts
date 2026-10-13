// Use case: set, change or remove a task's review interval and review-on day
// from the task panel (GLOSSARY: 回顾周期, 指定回顾日). Only a new review
// interval counts as a review; nothing else moves the last reviewed day.
import { planSetReview, type ReviewSetting } from "../../domain/review/review";
import type { TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import { ReviewUnreadableError } from "./review-unreadable-error";

/**
 * Writes `setting` as task `id`'s review plan in one undo. Throws
 * `ReviewUnreadableError`, writing nothing, when its review plan cannot be
 * read; other errors are thrown as they are, for `ui` to report.
 */
export type SetReviewPlan = (
  id: TaskId,
  setting: ReviewSetting,
) => Promise<void>;

export function createSetReviewPlan(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): SetReviewPlan {
  return async (id, setting) => {
    const task = await deps.repository.getTask(id);
    const current = task?.review ?? { kind: "none" };
    if (current.kind === "unreadable") {
      throw new ReviewUnreadableError(current.reason);
    }
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    // A block that is no longer a task fails in the write, writing nothing.
    await deps.repository.updateTask(id, {
      review: planSetReview(current, setting, today),
    });
  };
}
