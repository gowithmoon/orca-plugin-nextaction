// How a stats period and its cells read (GLOSSARY: 统计周期, #135), per
// scale. Display only.
import type { StatsCellRead } from "../../../application/usecases/read-stats";
import type { StatsScale } from "../../../domain/stats/stats-period";
import type { CalendarDate } from "../../../domain/task/task";
import { compareDays } from "../../../domain/time/calendar-days";
import { t } from "../../../shared/l10n/l10n";
import { formatDate, weekday } from "../../components/format";

/** The scale's name on its button. */
export function scaleName(scale: StatsScale): string {
  switch (scale) {
    case "week":
      return t("Week");
    case "month":
      return t("Month");
    case "year":
      return t("Year");
  }
}

/** A month as "2026年10月". */
function monthTitle(date: CalendarDate): string {
  return t("${year}/${month}", {
    year: String(date.year),
    month: String(date.month),
  });
}

/** The period's title: its first and last day, its month, or its year. */
export function periodTitle(
  period: {
    readonly scale: StatsScale;
    readonly first: CalendarDate;
    readonly last: CalendarDate;
  },
  today: CalendarDate,
): string {
  switch (period.scale) {
    case "week":
      return t("${first} – ${last}", {
        first: formatDate(period.first, today),
        last: formatDate(period.last, today),
      });
    case "month":
      return monthTitle(period.first);
    case "year":
      return t("Year ${year}", { year: String(period.first.year) });
  }
}

/** The label under a cell: its weekday, its day of the month or its month. */
export function cellLabel(scale: StatsScale, cell: StatsCellRead): string {
  switch (scale) {
    case "week":
      return weekday(cell.first);
    case "month":
      return String(cell.first.day);
    case "year":
      return t("Month ${month}", { month: String(cell.first.month) });
  }
}

/** What a cell's bar reads as: its day (its month) and its counts. */
export function cellDescription(
  scale: StatsScale,
  cell: StatsCellRead,
  today: CalendarDate,
): string {
  return t("${date}: ${completions} completed, ${skips} skipped", {
    date:
      scale === "year" ? monthTitle(cell.first) : formatDate(cell.first, today),
    completions: String(cell.completions),
    skips: String(cell.skips),
  });
}

/** Whether the cell holds the logical day `today`. */
export function holdsToday(cell: StatsCellRead, today: CalendarDate): boolean {
  return (
    compareDays(cell.first, today) <= 0 && compareDays(today, cell.last) <= 0
  );
}

/** Names the chart's bars as a group. */
export function chartLabel(scale: StatsScale): string {
  return scale === "year" ? t("Completions by month") : t("Completions by day");
}

/** What shows when the period has no completion and no skip. */
export function emptyText(scale: StatsScale, current: boolean): string {
  if (!current) return t("Nothing completed or skipped in this period");
  switch (scale) {
    case "week":
      return t("Nothing completed or skipped this week");
    case "month":
      return t("Nothing completed or skipped this month");
    case "year":
      return t("Nothing completed or skipped this year");
  }
}
