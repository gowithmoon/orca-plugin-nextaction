// How a recurrence rule reads in the plugin (GLOSSARY: 重复规则, 重复基准):
// "每 2 周 · 按日程". Display only.
import type {
  RecurrenceBasis,
  RecurrencePeriod,
  RecurrenceRead,
  RecurrenceRule,
  RecurrenceUnit,
} from "../../domain/recurrence/recurrence";
import { t } from "../../shared/l10n/l10n";

/** "每 2 周", "每天". */
export function periodText(period: RecurrencePeriod): string {
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
  }
}

/** "按日程", "按完成". */
export function basisName(basis: RecurrenceBasis): string {
  return basis === "schedule" ? t("Fixed schedule") : t("After completion");
}

/** "每 2 周 · 按日程". */
export function ruleText(rule: RecurrenceRule): string {
  return t("${period} · ${basis}", {
    period: periodText(rule.period),
    basis: basisName(rule.basis),
  });
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
