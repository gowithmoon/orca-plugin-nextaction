// How a recurrence rule reads in the plugin (GLOSSARY: 重复规则, 重复方式):
// "每 2 周 周一、周三 · 按固定日程", "每月最后一个周五 · 按完成日期". Display only.
import type {
  DayOfWeek,
  MonthPlacement,
  RecurrenceBasis,
  RecurrenceEnd,
  RecurrencePeriod,
  RecurrenceRead,
  RecurrenceRule,
  RecurrenceUnit,
  WeekdayOrdinal,
} from "../../domain/recurrence/recurrence";
import { t } from "../../shared/l10n/l10n";

/** "每 2 周", "每天": the interval and unit, without the placement. */
function everyText(period: RecurrencePeriod): string {
  const n = String(period.interval);
  const one = period.interval === 1;
  switch (period.unit) {
    case "day":
      return one ? t("Every day") : t("Every ${n} days", { n });
    case "week":
      return one ? t("Every week") : t("Every ${n} weeks", { n });
    case "month":
      return one ? t("Every month") : t("Every ${n} months", { n });
    case "year":
      return one ? t("Every year") : t("Every ${n} years", { n });
    case "weekday":
      return one ? t("Every weekday") : t("Every ${n} weekdays", { n });
  }
}

/** "周一". */
export function dayOfWeekName(day: DayOfWeek): string {
  switch (day) {
    case 1:
      return t("Mon");
    case 2:
      return t("Tue");
    case 3:
      return t("Wed");
    case 4:
      return t("Thu");
    case 5:
      return t("Fri");
    case 6:
      return t("Sat");
    case 7:
      return t("Sun");
  }
}

/** "1月". */
export function monthName(month: number): string {
  return t("Month ${month}", { month: String(month) });
}

/** "第二个周二", "最后一个周五". */
export function weekdayOfMonthText(
  ordinal: WeekdayOrdinal,
  weekday: DayOfWeek,
): string {
  const values = { weekday: dayOfWeekName(weekday) };
  switch (ordinal) {
    case 1:
      return t("the first ${weekday}", values);
    case 2:
      return t("the second ${weekday}", values);
    case 3:
      return t("the third ${weekday}", values);
    case 4:
      return t("the fourth ${weekday}", values);
    case 5:
      return t("the fifth ${weekday}", values);
    case "last":
      return t("the last ${weekday}", values);
  }
}

/** "15 日", "最后一天", "第二个周二". */
function monthPlacementText(placement: MonthPlacement): string {
  switch (placement.kind) {
    case "dayOfMonth":
      return t("day ${day}", { day: String(placement.day) });
    case "lastDayOfMonth":
      return t("the last day");
    case "weekdayOfMonth":
      return weekdayOfMonthText(placement.ordinal, placement.weekday);
  }
}

/**
 * "每 2 周 周一、周三", "每月最后一天", "每年 3月15日", "每天": the period with its
 * placement (#88).
 */
export function periodText(period: RecurrencePeriod): string {
  const every = everyText(period);
  switch (period.unit) {
    case "week":
      return period.placement
        ? t("${every} on ${days}", {
            every,
            days: period.placement.days.map(dayOfWeekName).join(t(", ")),
          })
        : every;
    case "month":
      return period.placement
        ? t("${every} on ${placement}", {
            every,
            placement: monthPlacementText(period.placement),
          })
        : every;
    case "year":
      return period.placement
        ? t("${every} on ${placement}", {
            every,
            placement: t("${month}/${day}", {
              month: String(period.placement.month),
              day: String(period.placement.day),
            }),
          })
        : every;
    default:
      return every;
  }
}

/** The name of a unit, as the popup offers it. */
export function unitName(unit: RecurrenceUnit): string {
  switch (unit) {
    case "day":
      return t("Days");
    case "week":
      return t("Weeks");
    case "month":
      return t("Months");
    case "year":
      return t("Years");
    case "weekday":
      return t("Weekdays");
  }
}

/** "按固定日程", "按完成日期". */
export function basisName(basis: RecurrenceBasis): string {
  return basis === "schedule" ? t("Fixed schedule") : t("After completion");
}

/**
 * "到 2026年12月31日为止", "共 5 次，剩 3 次" (#89). The end day carries its
 * year: the summary has no current day to leave it out against.
 */
export function endText(end: RecurrenceEnd): string {
  if (end.kind === "until") {
    return t("Until ${date}", {
      date: t("${year}/${month}/${day}", {
        year: String(end.day.year),
        month: String(end.day.month),
        day: String(end.day.day),
      }),
    });
  }
  return t("${total} times, ${remaining} left", {
    total: String(end.total),
    remaining: String(end.remaining),
  });
}

/**
 * "每 2 周 · 按固定日程", with the end condition: "每周 · 按固定日程 · 共 5 次，剩 3 次"
 * (#89), and "· 已暂停" while paused (#92).
 */
export function ruleText(rule: RecurrenceRule): string {
  const text = t("${period} · ${basis}", {
    period: periodText(rule.period),
    basis: basisName(rule.basis),
  });
  const withEnd = rule.end
    ? t("${rule} · ${end}", { rule: text, end: endText(rule.end) })
    : text;
  return rule.paused ? t("${rule} · Paused", { rule: withEnd }) : withEnd;
}

/** What the task panel's row shows for a task's rule as read. */
export function recurrenceText(recurrence: RecurrenceRead): string {
  switch (recurrence.kind) {
    case "none":
      return t("Does not repeat");
    case "rule":
      return ruleText(recurrence.rule);
    case "unreadable":
      return t("Cannot be read (${reason})", { reason: recurrence.reason });
  }
}
