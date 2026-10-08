// How task values read in the plugin panel. Display only: nothing here
// changes what the notes hold.
import type { CalendarDate, Rating, Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";

/**
 * The task's text as shown: a placeholder when it is blank, which `empty`
 * marks so it can be styled apart.
 */
export function shownText(task: Task): { text: string; empty: boolean } {
  return task.text.trim() === ""
    ? { text: t("(No text)"), empty: true }
    : { text: task.text, empty: false };
}

function weekday(date: CalendarDate): string {
  // Local calendar arithmetic only (ADR 0012); no current time involved.
  switch (new Date(date.year, date.month - 1, date.day).getDay()) {
    case 0:
      return t("Sun");
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
    default:
      return t("Sat");
  }
}

/**
 * A date as "10月15日 周四"; with the year when it is not the year of
 * `today` (the current logical day).
 */
export function formatDate(date: CalendarDate, today: CalendarDate): string {
  const values = {
    year: String(date.year),
    month: String(date.month),
    day: String(date.day),
  };
  const day =
    date.year === today.year
      ? t("${month}/${day}", values)
      : t("${year}/${month}/${day}", values);
  return `${day} ${weekday(date)}`;
}

/** A context always reads with `@` (GLOSSARY: 上下文); a label never gets one. */
export function formatContext(context: string): string {
  return context.startsWith("@") ? context : `@${context}`;
}

/** The name of an importance level (GLOSSARY: 重要性). */
export function importanceName(level: Rating): string {
  switch (level) {
    case 1:
      return t("Lowest");
    case 2:
      return t("Very low");
    case 3:
      return t("Low");
    case 4:
      return t("Medium");
    case 5:
      return t("High");
    case 6:
      return t("Very high");
    case 7:
      return t("Highest");
  }
}

/** The name of an effort level (GLOSSARY: 工作量). */
export function effortName(level: Rating): string {
  switch (level) {
    case 1:
      return t("Tiny");
    case 2:
      return t("Very small");
    case 3:
      return t("Small");
    case 4:
      return t("Medium");
    case 5:
      return t("Large");
    case 6:
      return t("Very large");
    case 7:
      return t("Huge");
  }
}
