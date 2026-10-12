// How reminders read in the plugin (GLOSSARY: 提醒): a moment as
// "10月20日 周二 9:00", the task panel row's summary ("10月20日 周二 9:00 · 另 2
// 个", "已过", "无"), and the quick options' names. Display only.
import {
  type QuickReminderOption,
  type ReminderRead,
  upcomingReminders,
} from "../../domain/reminder/reminder";
import type { CalendarDate } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { formatClock, formatDate } from "./format";

/** The calendar day a moment falls on, local time (ADR 0012). */
function localDay(at: Date): CalendarDate {
  return {
    year: at.getFullYear(),
    month: at.getMonth() + 1,
    day: at.getDate(),
  };
}

/**
 * A reminder's moment as "10月20日 周二 9:00"; with the year when it is not
 * the year of `today`.
 */
export function formatMoment(at: Date, today: CalendarDate): string {
  return `${formatDate(localDay(at), today)} ${formatClock(at)}`;
}

/**
 * What the task panel's reminder row shows: the next reminder still to come
 * and how many others the task has, "Passed" when every one has passed, or
 * "None" without any.
 */
export function remindersText(
  read: ReminderRead,
  now: Date,
  today: CalendarDate,
): string {
  if (read.kind === "unreadable") {
    return t("Cannot be read (${reason})", { reason: read.reason });
  }
  const reminders = read.kind === "list" ? read.reminders : [];
  if (reminders.length === 0) return t("No reminders");
  const [next] = upcomingReminders(reminders, now);
  if (!next) return t("Passed");
  const others = reminders.length - 1;
  const moment = formatMoment(next, today);
  return others === 0
    ? moment
    : t("${moment} · ${n} more", { moment, n: String(others) });
}

/** A quick option's name: "截止日期当天", "截止日期前 3 天", "开始日期前 1 天". */
export function quickOptionName(
  option: Pick<QuickReminderOption, "from" | "daysBefore">,
): string {
  const n = String(option.daysBefore);
  if (option.from === "due") {
    if (option.daysBefore === 0) return t("On the due date");
    return option.daysBefore === 1
      ? t("1 day before the due date")
      : t("${n} days before the due date", { n });
  }
  if (option.daysBefore === 0) return t("On the start date");
  return option.daysBefore === 1
    ? t("1 day before the start date")
    : t("${n} days before the start date", { n });
}
