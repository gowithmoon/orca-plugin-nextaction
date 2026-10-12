// The task panel's review row (GLOSSARY: 回顾周期, 指定回顾日, 标记已回顾, #103):
// the plan's summary ("每 2 周 · 下次 10月20日", "10月15日回顾", or "不回顾") as a
// button that opens the review popup, and "Mark reviewed" beside it while
// the task can be marked, so marking stays one click. Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import type { ReviewRead } from "../../domain/review/review";
import type { CalendarDate } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { reviewText } from "../components/review-text";

export function ReviewField(props: {
  labelId: string;
  review: ReviewRead;
  today: CalendarDate;
  /** Whether "Mark reviewed" is offered (`CanMarkReviewed`). */
  canMark: boolean;
  onOpen: () => void;
  onMark: () => void;
}) {
  const { Button, Tooltip } = orca.components;
  const valueId = `${props.labelId}-value`;
  const unreadable = props.review.kind === "unreadable";
  return (
    <div className="nextaction-recurrence-field nextaction-review-field">
      <Button
        id={valueId}
        className="nextaction-recurrence-button"
        variant="outline"
        aria-labelledby={`${props.labelId} ${valueId}`}
        aria-haspopup="dialog"
        data-empty={props.review.kind === "none" || undefined}
        data-unreadable={unreadable || undefined}
        onClick={props.onOpen}
      >
        <i className="ti ti-eye-check" aria-hidden="true" />
        {reviewText(props.review, props.today)}
      </Button>
      {props.canMark && (
        <Tooltip text={t("Mark reviewed")}>
          <Button
            variant="plain"
            aria-label={t("Mark reviewed")}
            onClick={props.onMark}
          >
            <i className="ti ti-checks" aria-hidden="true" />
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
