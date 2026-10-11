// Use case: mark a task reviewed (GLOSSARY: 标记已回顾), from the task panel
// and the task menu: today becomes its last reviewed day and its review-on
// day is cleared. Only this counts as having reviewed the task.
import {
  type NotMarkableReason,
  planMarkReviewed,
} from "../../domain/review/review";
import type { TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import { ReviewUnreadableError } from "./review-unreadable-error";

export type { NotMarkableReason };

/**
 * The task cannot be marked reviewed: it has neither a review interval nor a
 * review-on day, or it is done (the notes may have changed since the menu
 * was shown). Nothing was written.
 */
export class NotMarkableError extends Error {
  override name = "NotMarkableError";
  constructor(readonly reason: NotMarkableReason) {
    super(`the task cannot be marked reviewed (${reason})`);
  }
}

/**
 * Marks task `id` reviewed in one undo. Throws `NotMarkableError` or
 * `ReviewUnreadableError`, writing nothing, when it cannot be marked; other
 * errors are thrown as they are, for `ui` to report.
 */
export type MarkReviewed = (id: TaskId) => Promise<void>;

export function createMarkReviewed(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): MarkReviewed {
  return async (id) => {
    const task = await deps.repository.getTask(id);
    if (!task) throw new NotMarkableError("no-plan");
    if (task.review.kind === "unreadable") {
      throw new ReviewUnreadableError(task.review.reason);
    }
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const plan = planMarkReviewed(task, today);
    if (plan.kind === "refused") throw new NotMarkableError(plan.reason);
    await deps.repository.writeReview(id, plan.plan);
  };
}
