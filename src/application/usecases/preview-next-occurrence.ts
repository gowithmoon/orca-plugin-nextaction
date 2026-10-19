// Use case: preview the next occurrence (GLOSSARY: 下次日期) of a rule being
// edited in the recurrence rule popup (#88), as if the task were completed
// today. Nothing is read or written.
import {
  countingDate,
  countsFrom,
  isLastOccurrence,
  nextOccurrence,
  overlapsNextOccurrence,
  type RecurrenceRule,
} from "../../domain/recurrence/recurrence";
import type { CalendarDate, TaskDates } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";

/** What completing the task today would do under the rule being edited. */
export interface NextOccurrencePreview {
  /**
   * The day the next occurrence counts from: the task's due or start date
   * (on a fixed schedule), or today (after completion, or without dates).
   */
  readonly from: {
    readonly date: "due" | "start" | "event";
    readonly day: CalendarDate;
  };
  /**
   * The next occurrence the period lays out from `from`; on the last
   * occurrence, the one that falls outside the end condition.
   */
  readonly next: CalendarDate;
  /**
   * Completing it today would be its last occurrence (#89): the task would
   * stay done, the rule removed.
   */
  readonly last: boolean;
  /**
   * Its start and due dates span longer than the way to `next`, so each
   * occurrence would overlap the one before.
   */
  readonly overlaps: boolean;
}

/**
 * What `rule` would do to a task with `dates`, were it completed today (the
 * current logical day).
 */
export type PreviewNextOccurrence = (
  rule: RecurrenceRule,
  dates: TaskDates,
) => NextOccurrencePreview;

export function createPreviewNextOccurrence(deps: {
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): PreviewNextOccurrence {
  return (rule, dates) => {
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const from = countsFrom(rule, dates, today);
    return {
      from: { date: countingDate(rule, dates), day: from },
      next: nextOccurrence(rule.period, from),
      last: isLastOccurrence(rule, dates, today),
      overlaps: overlapsNextOccurrence(rule, dates, today),
    };
  };
}
