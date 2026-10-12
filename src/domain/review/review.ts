// Reviewing single tasks (GLOSSARY: 回顾周期, 指定回顾日, 需要回顾, 标记已回顾).
// Pure: today's logical day is passed in; whole-day arithmetic comes from
// `domain/time`.
import {
  dayOfMonthIn,
  nextInMonths,
  nextOccurrence,
  type WeekPlacement,
} from "../recurrence/recurrence";
import type { CalendarDate, TaskStatus } from "../task/task";
import {
  addDays,
  compareDays,
  dayOfWeek,
  daysInMonth,
  monthsAfter,
} from "../time/calendar-days";

/** The units a review interval counts in. */
export const reviewUnits = ["day", "week", "month"] as const;
export type ReviewUnit = (typeof reviewUnits)[number];

/**
 * How often a task is to be reviewed: every `every` units, on the review
 * placement chosen for the unit (GLOSSARY: 回顾周期, #105). Days have no
 * placement.
 */
export type ReviewInterval =
  | {
      /** A whole number from 1 up. */
      readonly every: number;
      readonly unit: "day";
    }
  | {
      readonly every: number;
      readonly unit: "week";
      readonly placement?: WeekPlacement;
    }
  | {
      readonly every: number;
      readonly unit: "month";
      readonly placement?: ReviewMonthPlacement;
    };

/**
 * Where in a month a monthly review interval falls (回顾落点): a day of the
 * month (1–31), the last day of the month, or the last weekday of the month
 * (GLOSSARY: 工作日; Monday to Friday, holidays not known).
 */
export type ReviewMonthPlacement =
  | { readonly kind: "dayOfMonth"; readonly day: number }
  | { readonly kind: "lastDayOfMonth" }
  | { readonly kind: "lastWeekdayOfMonth" };

/** The placement's day in a month, or none when the month does not have it. */
function reviewDayInMonth(
  year: number,
  month: number,
  placement: ReviewMonthPlacement,
): readonly CalendarDate[] {
  if (placement.kind === "dayOfMonth") {
    return dayOfMonthIn(year, month, placement.day);
  }
  if (placement.kind === "lastDayOfMonth") {
    return dayOfMonthIn(year, month, "last");
  }
  // The last day, moved back to Friday when it is a Saturday or Sunday.
  const last = { year, month, day: daysInMonth(year, month) };
  const weekday = dayOfWeek(last);
  return [weekday <= 5 ? last : addDays(last, 5 - weekday)];
}

/**
 * A task's review plan: its review interval, the logical day it was last
 * marked reviewed, and its review-on day, each optional.
 */
export interface ReviewPlan {
  readonly interval: ReviewInterval | null;
  readonly lastReviewed: CalendarDate | null;
  readonly reviewOn: CalendarDate | null;
}

/**
 * What a task's review plan reads as. `none`: nothing stored. `unreadable`:
 * something is stored that this plugin cannot read (an unknown version, a
 * value out of range); it is kept as it is and cannot be written.
 */
export type ReviewRead =
  | { readonly kind: "none" }
  | { readonly kind: "plan"; readonly plan: ReviewPlan }
  | { readonly kind: "unreadable"; readonly reason: string };

/** What a task reads as without a review plan. */
export const noReview: ReviewRead = { kind: "none" };

/** A review plan this plugin reads: none, or a plan. */
export type ReadableReview = Exclude<ReviewRead, { kind: "unreadable" }>;

/**
 * What the user sets in the task panel: the review interval and the
 * review-on day. The last reviewed day is not theirs to set.
 */
export interface ReviewSetting {
  readonly interval: ReviewInterval | null;
  readonly reviewOn: CalendarDate | null;
}

/**
 * The review plan to write when the user sets `setting` over `current` on
 * the logical day `today`.
 */
export function planSetReview(
  current: ReadableReview,
  setting: ReviewSetting,
  today: CalendarDate,
): ReviewPlan {
  const before = current.kind === "plan" ? current.plan : null;
  const lastReviewed =
    setting.interval && !before?.interval
      ? today
      : (before?.lastReviewed ?? null);
  return {
    interval: setting.interval,
    lastReviewed,
    reviewOn: setting.reviewOn,
  };
}

/**
 * Why a task cannot be marked reviewed: it has neither a review interval nor
 * a review-on day, or it is done.
 */
export type NotMarkableReason = "no-plan" | "done";

/**
 * Marking `task` reviewed on the logical day `today` (GLOSSARY: 标记已回顾):
 * today becomes the last reviewed day and the review-on day is cleared. A
 * task not yet due can be marked early. A review plan this plugin cannot
 * read is refused as no plan here; the caller reports it as unreadable.
 */
export function planMarkReviewed(
  task: ReviewedTask,
  today: CalendarDate,
):
  | { readonly kind: "markable"; readonly plan: ReviewPlan }
  | { readonly kind: "refused"; readonly reason: NotMarkableReason } {
  const reason = notMarkableReason(task);
  if (reason !== null || task.review.kind !== "plan") {
    return { kind: "refused", reason: reason ?? "no-plan" };
  }
  const { interval } = task.review.plan;
  return {
    kind: "markable",
    plan: { interval, lastReviewed: today, reviewOn: null },
  };
}

/**
 * Why `task` cannot be marked reviewed, or `null` when it can
 * (`planMarkReviewed`). A review plan this plugin cannot read counts as no
 * plan.
 */
export function notMarkableReason(
  task: ReviewedTask,
): NotMarkableReason | null {
  const plan = task.review.kind === "plan" ? task.review.plan : null;
  if (!plan || (!plan.interval && !plan.reviewOn)) return "no-plan";
  if (task.status === "done") return "done";
  return null;
}

/** What whether a task is due for review depends on. */
export interface ReviewedTask {
  readonly status: TaskStatus;
  readonly review: ReviewRead;
}

/**
 * Whether the task is due for review on the logical day `today` (GLOSSARY:
 * 需要回顾).
 */
export function isDueForReview(
  task: ReviewedTask,
  today: CalendarDate,
): boolean {
  // Done tasks never are; every other status is, waiting and someday
  // included, and so are tasks in a parked subtree (GLOSSARY: 搁置子树).
  if (task.status === "done" || task.review.kind !== "plan") return false;
  const day = reviewDueDay(task.review.plan);
  return day !== null && compareDays(day, today) <= 0;
}

/**
 * The day the task comes due for review: its next review day or its review-on
 * day, whichever is earlier (neither puts the other off). None without
 * either.
 */
export function reviewDueDay(plan: ReviewPlan): CalendarDate | null {
  const next = nextReviewDay(plan);
  const on = plan.reviewOn;
  if (next === null) return on;
  if (on === null) return next;
  return compareDays(next, on) <= 0 ? next : on;
}

/**
 * The day the review interval comes round again: the last reviewed day plus
 * one interval. None without an interval or a last reviewed day.
 */
export function nextReviewDay(plan: ReviewPlan): CalendarDate | null {
  const { interval, lastReviewed } = plan;
  if (!interval || !lastReviewed) return null;
  switch (interval.unit) {
    case "day":
      return addDays(lastReviewed, interval.every);
    case "week":
      if (interval.placement) {
        return nextOccurrence(
          {
            interval: interval.every,
            unit: "week",
            placement: interval.placement,
          },
          lastReviewed,
        );
      }
      return addDays(lastReviewed, 7 * interval.every);
    case "month": {
      const { placement } = interval;
      if (placement) {
        // Months without that day are skipped, as for a recurrence rule.
        return nextInMonths(lastReviewed, interval.every, (year, month) =>
          reviewDayInMonth(year, month, placement),
        );
      }
      const { year, month } = monthsAfter(
        lastReviewed.year,
        lastReviewed.month,
        interval.every,
      );
      // A month without that day takes its last day (January 31 → February 28).
      return {
        year,
        month,
        day: Math.min(lastReviewed.day, daysInMonth(year, month)),
      };
    }
  }
}
