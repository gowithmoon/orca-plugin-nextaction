// The task panel's review row (GLOSSARY: 回顾周期, 指定回顾日, 标记已回顾, #103):
// the review interval (a number and a unit), the review-on day, the next and
// last reviewed days read only, and "Mark reviewed" while the task can be
// marked. Edited in place; each change is one write. Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import {
  nextReviewDay,
  type ReviewInterval,
  type ReviewRead,
  type ReviewSetting,
  type ReviewUnit,
  reviewUnits,
} from "../../domain/review/review";
import type { CalendarDate } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { formatDate } from "../components/format";
import { reviewUnitName } from "../components/review-text";
import { DateField } from "./task-panel-fields";

/**
 * A whole number typed for the interval: empty is no interval (`null`), a
 * whole number from 1 up is kept, anything else is refused (`undefined`).
 */
function typedEvery(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const every = Number(trimmed);
  return every >= 1 ? every : undefined;
}

const sameInterval = (a: ReviewInterval | null, b: ReviewInterval | null) =>
  a === b ||
  (a !== null && b !== null && a.every === b.every && a.unit === b.unit);

export function ReviewField(props: {
  labelId: string;
  review: ReviewRead;
  today: CalendarDate;
  /** Whether "Mark reviewed" is offered (`CanMarkReviewed`). */
  canMark: boolean;
  onSet: (setting: ReviewSetting) => void;
  onMark: () => void;
}) {
  const { Button, Input, Segmented } = orca.components;
  const { review, today } = props;
  const plan = review.kind === "plan" ? review.plan : null;
  const interval = plan?.interval ?? null;
  const reviewOn = plan?.reviewOn ?? null;
  const fromNotes = interval ? String(interval.every) : "";
  const [draft, setDraft] = React.useState(fromNotes);
  // The unit offered before an interval is set; a set one shows its own.
  const [unit, setUnit] = React.useState<ReviewUnit>(interval?.unit ?? "week");
  const focused = React.useRef(false);
  // The notes changed (e.g. elsewhere): show it, unless the user is typing.
  React.useEffect(() => {
    if (!focused.current) setDraft(fromNotes);
  }, [fromNotes]);
  React.useEffect(() => {
    if (interval) setUnit(interval.unit);
  }, [interval]);

  if (review.kind === "unreadable") {
    // Kept as it is: nothing here may overwrite it.
    return (
      <div className="nextaction-review-field" data-unreadable>
        {t("Cannot be read (${reason})", { reason: review.reason })}
      </div>
    );
  }

  const set = (next: ReviewInterval | null) => {
    if (!sameInterval(next, interval))
      props.onSet({ interval: next, reviewOn });
  };
  const save = () => {
    const every = typedEvery(draft);
    // Not a whole number from 1 up: show what the notes hold, write nothing.
    if (every === undefined) {
      setDraft(fromNotes);
      return;
    }
    set(every === null ? null : { every, unit });
  };

  const next = plan && nextReviewDay(plan);
  const onId = `${props.labelId}-on`;
  return (
    <div className="nextaction-review-field">
      <div className="nextaction-review-interval">
        <span className="nextaction-review-every">{t("Every")}</span>
        <Input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          aria-labelledby={props.labelId}
          placeholder={t("None")}
          value={draft}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setDraft(e.target.value)
          }
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            save();
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            save();
          }}
        />
        <Segmented
          role="group"
          aria-labelledby={props.labelId}
          selected={unit}
          options={reviewUnits.map((value) => ({
            value,
            label: reviewUnitName(value),
          }))}
          onChange={(value) => {
            const chosen = reviewUnits.find((u) => u === value);
            if (!chosen) return;
            setUnit(chosen);
            // A set interval changes unit at once; without one, the unit
            // waits for a number.
            if (interval) set({ every: interval.every, unit: chosen });
          }}
        />
      </div>
      <div className="nextaction-review-on">
        <span id={onId} className="nextaction-review-on-label">
          {t("Review on")}
        </span>
        <DateField
          labelId={onId}
          value={reviewOn}
          today={today}
          onChange={(day) => props.onSet({ interval, reviewOn: day })}
        />
      </div>
      <div className="nextaction-review-status">
        <span>
          {next
            ? t("Next review: ${date}", { date: formatDate(next, today) })
            : !reviewOn && t("No review")}
        </span>
        {plan?.lastReviewed && (
          <span className="nextaction-review-last">
            {t("Last reviewed: ${date}", {
              date: formatDate(plan.lastReviewed, today),
            })}
          </span>
        )}
        {props.canMark && (
          <Button variant="outline" onClick={props.onMark}>
            <i className="ti ti-checks" aria-hidden="true" />
            {t("Mark reviewed")}
          </Button>
        )}
      </div>
    </div>
  );
}
