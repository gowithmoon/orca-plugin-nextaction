// Paging through stats periods (GLOSSARY: 统计周期): back without end,
// forward as far as the current period. Pure: today's logical day is passed
// in.
import type { CalendarDate } from "../task/task";
import { addDays, compareDays } from "../time/calendar-days";
import type { StatsPeriod } from "./stats-period";

/** Where a period pages to. */
export interface StatsPaging {
  /** Whether it holds today's logical day. */
  readonly current: boolean;
  /** A logical day of the period before, its anchor. */
  readonly previous: CalendarDate;
  /** A logical day of the period after; none from the current period. */
  readonly next?: CalendarDate;
}

/**
 * The anchor a period is read for: `anchor`, or `today` when it is later,
 * so no period after the current one is read.
 */
export function pagedAnchor(
  anchor: CalendarDate | undefined,
  today: CalendarDate,
): CalendarDate {
  return anchor !== undefined && compareDays(anchor, today) < 0
    ? anchor
    : today;
}

/** The paging of `period`, read on the logical day `today`. */
export function statsPaging(
  period: Pick<StatsPeriod, "first" | "last">,
  today: CalendarDate,
): StatsPaging {
  const previous = addDays(period.first, -1);
  // A period read for a pagedAnchor never ends before it starts.
  if (compareDays(today, period.last) <= 0) {
    return { current: true, previous };
  }
  return { current: false, previous, next: addDays(period.last, 1) };
}
