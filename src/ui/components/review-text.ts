// How a review plan reads in the plugin (GLOSSARY: 回顾周期, 指定回顾日):
// "每 2 周 · 下次 10月20日", "每周 周四 · 下次 10月15日", "10月15日回顾", both
// joined, or "不回顾".
// Display only.
import {
  nextReviewDay,
  type ReviewInterval,
  type ReviewMonthPlacement,
  type ReviewRead,
  type ReviewUnit,
} from "../../domain/review/review";
import type { CalendarDate } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { dayOfWeekName } from "./recurrence-text";

/** The name of a unit, as the review popup offers it. */
export function reviewUnitName(unit: ReviewUnit): string {
  switch (unit) {
    case "day":
      return t("Days");
    case "week":
      return t("Weeks");
    case "month":
      return t("Months");
  }
}

/** "每 2 周", "每天": the interval and unit, without the placement. */
function everyText(interval: ReviewInterval): string {
  const n = String(interval.every);
  const one = interval.every === 1;
  switch (interval.unit) {
    case "day":
      return one ? t("Every day") : t("Every ${n} days", { n });
    case "week":
      return one ? t("Every week") : t("Every ${n} weeks", { n });
    case "month":
      return one ? t("Every month") : t("Every ${n} months", { n });
  }
}

/** "15 日", "最后一天", "最后一个工作日". */
export function reviewMonthPlacementText(
  placement: ReviewMonthPlacement,
): string {
  switch (placement.kind) {
    case "dayOfMonth":
      return t("day ${day}", { day: String(placement.day) });
    case "lastDayOfMonth":
      return t("the last day");
    case "lastWeekdayOfMonth":
      return t("the last weekday");
  }
}

/**
 * "每 2 周", "每周 周四", "每月 最后一个工作日": the interval with its review
 * placement (#105), worded as a recurrence rule's period.
 */
export function reviewIntervalText(interval: ReviewInterval): string {
  const every = everyText(interval);
  switch (interval.unit) {
    case "week":
      return interval.placement
        ? t("${every} on ${days}", {
            every,
            days: interval.placement.days.map(dayOfWeekName).join(t(", ")),
          })
        : every;
    case "month":
      return interval.placement
        ? t("${every} on ${placement}", {
            every,
            placement: reviewMonthPlacementText(interval.placement),
          })
        : every;
    case "day":
      return every;
  }
}

/**
 * "10月20日"; with the year when it is not the year of `today`. No weekday:
 * the row's summary is one short line.
 */
function shortDate(date: CalendarDate, today: CalendarDate): string {
  const values = {
    year: String(date.year),
    month: String(date.month),
    day: String(date.day),
  };
  return date.year === today.year
    ? t("${month}/${day}", values)
    : t("${year}/${month}/${day}", values);
}

/** What the task panel's review row shows for a task's review plan as read. */
export function reviewText(review: ReviewRead, today: CalendarDate): string {
  if (review.kind === "unreadable") {
    return t("Cannot be read (${reason})", { reason: review.reason });
  }
  const plan = review.kind === "plan" ? review.plan : null;
  const interval = plan?.interval;
  const next = plan && nextReviewDay(plan);
  const every =
    interval &&
    (next
      ? t("${every} · next ${date}", {
          every: reviewIntervalText(interval),
          date: shortDate(next, today),
        })
      : reviewIntervalText(interval));
  const on =
    plan?.reviewOn &&
    t("Review on ${date}", { date: shortDate(plan.reviewOn, today) });
  if (every && on) return t("${every} · ${on}", { every, on });
  return every || on || t("No review");
}
