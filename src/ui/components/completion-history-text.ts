// How a task's completion history (GLOSSARY: 完成历史) reads in the task
// panel (#209): the row's summary ("完成于 10月18日 周六", "完成 12 次 · 跳过
// 2 次 · 最近 10月18日 周六") and one entry's kind. Display only.
import type { CompletionHistoryRead } from "../../application/ports/task-repository";
import {
  type CompletionEntry,
  entryKind,
} from "../../domain/task/completion-history";
import type { CalendarDate } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { formatDate } from "./format";

/** "Completed" or "Skipped", for one entry. */
export function entryKindText(entry: CompletionEntry): string {
  return entryKind(entry) === "skip" ? t("Skipped") : t("Completed");
}

/**
 * The row's summary: one entry as "Completed on {date}" or "Skipped on
 * {date}"; several as the counts (a count of 0 left out) and the latest
 * entry's logical day. `null` without any entry: the row is not shown.
 */
export function completionHistoryText(
  read: CompletionHistoryRead,
  today: CalendarDate,
): string | null {
  if (read.kind === "unreadable") {
    return t("Cannot be read (${reason})", { reason: read.reason });
  }
  const { history } = read;
  const latest = history.at(-1);
  if (!latest) return null;
  const date = formatDate(latest.day, today);
  if (history.length === 1) {
    return entryKind(latest) === "skip"
      ? t("Skipped on ${date}", { date })
      : t("Completed on ${date}", { date });
  }
  const skips = history.filter((entry) => entryKind(entry) === "skip").length;
  const completions = history.length - skips;
  return [
    ...(completions > 0
      ? [t("Completed ${n} times", { n: String(completions) })]
      : []),
    ...(skips > 0 ? [t("Skipped ${n} times", { n: String(skips) })] : []),
    t("Latest ${date}", { date }),
  ].join(" · ");
}
