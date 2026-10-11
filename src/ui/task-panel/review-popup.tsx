// The review popup (GLOSSARY: 回顾周期, 指定回顾日, 标记已回顾, #103): the review
// interval (none, or every N days / weeks / months) and the review-on day,
// the last reviewed day read only and the next review day the draft would
// give. Saving writes both in one undo; a task with a plan can have it
// removed, and a task that can be marked can be marked reviewed here. In
// Orca's ModalOverlay with the shared window look, rendered into its own
// React root, as the recurrence rule popup. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  CanMarkReviewed,
  MarkReviewed,
} from "../../application/usecases/mark-reviewed";
import type { SetReviewPlan } from "../../application/usecases/set-review-plan";
import {
  nextReviewDay,
  planSetReview,
  type ReviewSetting,
  type ReviewUnit,
  reviewUnits,
} from "../../domain/review/review";
import type { CalendarDate, Task } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { formatDate, shownText } from "../components/format";
import { PopupLayer } from "../components/popup-layer";
import { reviewUnitName } from "../components/review-text";
import { useFocusInside } from "../hooks/use-focus-inside";
import {
  type Notify,
  notifyMarkReviewedFailure,
  notifySetReviewFailure,
} from "../notify";
import { DateField } from "./task-panel-fields";

export interface ReviewPopupDeps {
  /** Writes the interval and review-on day (#103). */
  setReviewPlan: SetReviewPlan;
  /** Marks the task reviewed (GLOSSARY: 标记已回顾). */
  markReviewed: MarkReviewed;
  /** Whether "Mark reviewed" is offered for the task. */
  canMarkReviewed: CanMarkReviewed;
  /** The current logical day, for showing dates and the next review day. */
  today: () => CalendarDate;
  notify: Notify;
}

/** Opens the popup for `task`, replacing one already open. */
export type OpenReviewPopup = (task: Task) => void;

/** The interval's unit as chosen, or no interval. */
type UnitChoice = ReviewUnit | "none";
const unitChoices: readonly UnitChoice[] = ["none", ...reviewUnits];

/** A whole number from 1 up typed into the interval field, or `undefined`. */
function typedEvery(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const every = Number(trimmed);
  return every >= 1 ? every : undefined;
}

const sameDay = (a: CalendarDate | null, b: CalendarDate | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day);

function ReviewPopup(props: {
  task: Task;
  deps: ReviewPopupDeps;
  onClose: () => void;
}) {
  const { task, deps, onClose } = props;
  const { Button, Input, ModalOverlay, Segmented, Tooltip } = orca.components;
  const idPrefix = React.useId();
  const id = (field: string) => `${idPrefix}-${field}`;
  const plan = task.review.kind === "plan" ? task.review.plan : null;
  const [unit, setUnit] = React.useState<UnitChoice>(
    plan?.interval?.unit ?? "none",
  );
  const [every, setEvery] = React.useState(String(plan?.interval?.every ?? 1));
  const [reviewOn, setReviewOn] = React.useState<CalendarDate | null>(
    plan?.reviewOn ?? null,
  );
  const [busy, setBusy] = React.useState(false);
  const focus = React.useRef<HTMLDivElement>(null);
  const restoreFocus = React.useRef(true);
  useFocusInside(focus, restoreFocus);

  const today = deps.today();
  // An unreadable plan cannot be overwritten (the use case refuses); the
  // popup says so instead of offering a save that would fail.
  const unreadable = task.review.kind === "unreadable";
  const typed = typedEvery(every);
  // `undefined` while the interval is incomplete (no whole number from 1 up).
  const setting: ReviewSetting | undefined =
    unit === "none"
      ? { interval: null, reviewOn }
      : typed === undefined
        ? undefined
        : { interval: { every: typed, unit }, reviewOn };
  // The next review day the draft would give, by the rule saving applies.
  const next =
    setting && task.review.kind !== "unreadable"
      ? nextReviewDay(planSetReview(task.review, setting, today))
      : null;
  const unchanged =
    setting !== undefined &&
    (setting.interval?.every ?? null) === (plan?.interval?.every ?? null) &&
    (setting.interval?.unit ?? null) === (plan?.interval?.unit ?? null) &&
    sameDay(setting.reviewOn, plan?.reviewOn ?? null);
  const markable = !unreadable && deps.canMarkReviewed(task);

  const run = async (
    write: () => Promise<void>,
    failed: (error: unknown) => void,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await write();
      onClose();
    } catch (error) {
      // The popup stays, with what was chosen.
      failed(error);
      setBusy(false);
    }
  };
  const write = (next: ReviewSetting) =>
    run(
      () => deps.setReviewPlan(task.id, next),
      (error) => notifySetReviewFailure(deps.notify, error),
    );
  const save = () => {
    if (setting === undefined || unreadable) return;
    // Nothing changed: nothing to undo either.
    if (unchanged) onClose();
    else void write(setting);
  };
  const mark = () =>
    void run(
      async () => {
        await deps.markReviewed(task.id);
        deps.notify("success", t("Marked reviewed"));
      },
      (error) => notifyMarkReviewedFailure(deps.notify, error),
    );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.defaultPrevented) return;
    // Keys from a popup rendered elsewhere still bubble here through React.
    if (!e.currentTarget.contains(e.target as Node)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      e.stopPropagation();
      save();
    }
  };

  const text = shownText(task);
  return (
    <ModalOverlay visible={true} canClose={true} onClose={onClose}>
      <PopupLayer>
        <div
          ref={focus}
          tabIndex={-1}
          className="nextaction-window nextaction-recurrence-popup"
          role="dialog"
          aria-modal="true"
          aria-labelledby={id("title")}
          onKeyDown={onKeyDown}
        >
          <header className="nextaction-recurrence-popup-header">
            <div className="nextaction-recurrence-popup-heading">
              <div
                className="nextaction-recurrence-popup-title"
                id={id("title")}
              >
                {t("Review")}
              </div>
              <div
                className="nextaction-recurrence-popup-task"
                data-empty={text.empty || undefined}
                title={text.text}
              >
                {text.text}
              </div>
            </div>
            <Tooltip text={t("Close")}>
              <Button variant="plain" aria-label={t("Close")} onClick={onClose}>
                <i className="ti ti-x" aria-hidden="true" />
              </Button>
            </Tooltip>
          </header>
          <div className="nextaction-recurrence-popup-body">
            {task.review.kind === "unreadable" && (
              <div className="nextaction-recurrence-popup-warning">
                {t(
                  "This task's review plan cannot be read (${reason}). It is kept as it is and cannot be changed here.",
                  { reason: task.review.reason },
                )}
              </div>
            )}
            <div className="nextaction-recurrence-popup-field">
              <span
                className="nextaction-recurrence-popup-label"
                id={id("interval")}
              >
                {t("Review interval")}
              </span>
              <div className="nextaction-review-popup-interval">
                {unit !== "none" && (
                  <>
                    <span>{t("Every")}</span>
                    <Input
                      aria-labelledby={id("interval")}
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={every}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setEvery(e.target.value)
                      }
                    />
                  </>
                )}
                <Segmented
                  role="group"
                  aria-labelledby={id("interval")}
                  selected={unit}
                  options={unitChoices.map((value) => ({
                    value,
                    label: value === "none" ? t("None") : reviewUnitName(value),
                  }))}
                  onChange={(value) => {
                    const chosen = unitChoices.find((u) => u === value);
                    if (chosen) setUnit(chosen);
                  }}
                />
              </div>
            </div>
            <div className="nextaction-recurrence-popup-field">
              <span className="nextaction-recurrence-popup-label" id={id("on")}>
                {t("Review on")}
              </span>
              <DateField
                labelId={id("on")}
                value={reviewOn}
                today={today}
                onChange={setReviewOn}
              />
              <div className="nextaction-recurrence-popup-hint">
                {t("A one-off day; cleared once the task is marked reviewed.")}
              </div>
            </div>
            <div className="nextaction-recurrence-popup-field">
              <span className="nextaction-recurrence-popup-label">
                {t("Last reviewed")}
              </span>
              <span>
                {plan?.lastReviewed
                  ? formatDate(plan.lastReviewed, today)
                  : t("Not yet")}
              </span>
            </div>
            {next && (
              <div
                className="nextaction-recurrence-popup-preview"
                aria-live="polite"
              >
                {t("Next review: ${date}", { date: formatDate(next, today) })}
              </div>
            )}
          </div>
          <footer className="nextaction-recurrence-popup-footer">
            {task.review.kind === "plan" && (
              <Button
                variant="plain"
                disabled={busy}
                onClick={() => void write({ interval: null, reviewOn: null })}
              >
                {t("Remove review")}
              </Button>
            )}
            {markable && (
              <Button variant="plain" disabled={busy} onClick={mark}>
                <i className="ti ti-checks" aria-hidden="true" />
                {t("Mark reviewed")}
              </Button>
            )}
            <span className="nextaction-recurrence-popup-spacer" />
            <Button variant="plain" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button
              variant="solid"
              disabled={setting === undefined || unreadable || busy}
              onClick={save}
            >
              {t("Save")}
            </Button>
          </footer>
        </div>
      </PopupLayer>
    </ModalOverlay>
  );
}

/** The popup in `render`'s root; at most one at a time. */
export function createReviewPopup(options: {
  deps: ReviewPopupDeps;
  render: (node: React.ReactNode) => void;
}): OpenReviewPopup {
  let shown = 0;
  return (task) => {
    shown += 1;
    const mine = shown;
    options.render(
      <ReviewPopup
        // Another task starts afresh.
        key={mine}
        task={task}
        deps={options.deps}
        onClose={() => {
          if (mine === shown) options.render(null);
        }}
      />,
    );
  };
}
