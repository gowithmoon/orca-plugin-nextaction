// How a review plan reads in the plugin (GLOSSARY: 回顾周期). Display only.
import type { ReviewUnit } from "../../domain/review/review";
import { t } from "../../shared/l10n/l10n";

/** The name of a unit, as the review row offers it. */
export function reviewUnitName(unit: ReviewUnit): string {
  switch (unit) {
    case "day":
      return t("Days");
    case "week":
      return t("Weeks");
    case "month":
      return t("Months");
  }
}
