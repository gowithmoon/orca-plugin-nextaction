// The stats period (GLOSSARY: 统计周期): the time span the stats view looks
// at, cut into cells. Pure: the anchor day is passed in.
import type { CalendarDate } from "../task/task";
import { addDays, compareDays, dayOfWeek } from "../time/calendar-days";

/**
 * How long a stats period is (GLOSSARY: 统计周期). Only the week so far; the
 * month and the year come with #135.
 */
export const statsScales = ["week"] as const;
export type StatsScale = (typeof statsScales)[number];

/**
 * One cell of a period: the logical days from `first` to `last`, both
 * included. A day for the week (and the month); a month for the year.
 */
export interface StatsCell {
  readonly first: CalendarDate;
  readonly last: CalendarDate;
}

export interface StatsPeriod {
  readonly scale: StatsScale;
  /** Its first logical day. */
  readonly first: CalendarDate;
  /** Its last logical day. */
  readonly last: CalendarDate;
  /** Its cells, the earliest first, covering it with no gap. */
  readonly cells: readonly StatsCell[];
}

/**
 * The period of `scale` that holds the logical day `anchor`. A week runs
 * from Monday to Sunday, a day per cell.
 */
export function statsPeriod(
  scale: StatsScale,
  anchor: CalendarDate,
): StatsPeriod {
  switch (scale) {
    case "week": {
      const first = addDays(anchor, 1 - dayOfWeek(anchor));
      const cells = Array.from({ length: 7 }, (_, index) => {
        const day = addDays(first, index);
        return { first: day, last: day };
      });
      return { scale, first, last: addDays(first, 6), cells };
    }
  }
}

/** Whether the logical day `day` falls within `cell`. */
export function inCell(cell: StatsCell, day: CalendarDate): boolean {
  return compareDays(day, cell.first) >= 0 && compareDays(day, cell.last) <= 0;
}
