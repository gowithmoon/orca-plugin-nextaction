// Use case: preview the next occurrence (GLOSSARY: 下一次发生) of a rule being
// edited in the recurrence rule popup (#88), as if the task were completed
// today. Nothing is read or written.
import {
  countsFrom,
  isLastOccurrence,
  nextOccurrence,
  type RecurrenceRule,
  type TaskDates,
} from "../../domain/recurrence/recurrence";
import type { CalendarDate } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";

/**
 * The day `rule` would move a task with `dates` to, were it completed today
 * (the current logical day); `null` when that would be its last occurrence
 * (#89): the task would stay done, the rule removed.
 */
export type PreviewNextOccurrence = (
  rule: RecurrenceRule,
  dates: TaskDates,
) => CalendarDate | null;

export function createPreviewNextOccurrence(deps: {
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): PreviewNextOccurrence {
  return (rule, dates) => {
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    if (isLastOccurrence(rule, dates, today)) return null;
    return nextOccurrence(rule.period, countsFrom(rule, dates, today));
  };
}
