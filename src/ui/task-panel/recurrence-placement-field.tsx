// The placement part of the recurrence rule popup (GLOSSARY: 重复规则, #88):
// which days of the week, which days of the month, which days of the year a
// period falls on, any number of them. Days and weekdays have none. Without
// one chosen, the period falls on the day matching the task's date. Verified
// by hand in Orca (docs/ARCHITECTURE.md §5).
import type * as React from "react";
import {
  type DayOfMonth,
  type DayOfWeek,
  type DayOfYear,
  daysOfWeek,
  inOrder,
  type RecurrencePeriod,
  type RecurrenceUnit,
  type WeekdayOfMonth,
  weekdayOrdinals,
} from "../../domain/recurrence/recurrence";
import type { CalendarDate } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { Select } from "../components/popup-controls";
import {
  dayOfMonthName,
  dayOfWeekName,
  monthName,
  weekdayOfMonthText,
} from "../components/recurrence-text";

/** What the popup holds for each unit's placement while the rule is edited. */
export interface PlacementDraft {
  /** No days: the weekday of the task's date. */
  readonly weekDays: readonly DayOfWeek[];
  readonly monthKind: "same" | "daysOfMonth" | "weekdaysOfMonth";
  /** No days: the day of the month of the task's date. */
  readonly monthDays: readonly DayOfMonth[];
  /** At least one row. */
  readonly monthWeekdays: readonly WeekdayOfMonth[];
  readonly yearKind: "same" | "daysOfYear";
  /** At least one row. */
  readonly yearDays: readonly DayOfYear[];
}

/**
 * The draft a popup starts with: the rule's placement where it has one, the
 * other choices preset from `day` (the task's date, else today).
 */
export function placementDraftOf(
  period: RecurrencePeriod | undefined,
  day: CalendarDate,
): PlacementDraft {
  const draft: PlacementDraft = {
    weekDays: [],
    monthKind: "same",
    monthDays: [day.day],
    monthWeekdays: [{ ordinal: 1, weekday: 1 }],
    yearKind: "same",
    yearDays: [{ month: day.month, day: day.day }],
  };
  if (period === undefined || !("placement" in period) || !period.placement) {
    return draft;
  }
  const placement = period.placement;
  switch (placement.kind) {
    case "daysOfWeek":
      return { ...draft, weekDays: placement.days };
    case "daysOfMonth":
      return { ...draft, monthKind: "daysOfMonth", monthDays: placement.days };
    case "weekdaysOfMonth":
      return {
        ...draft,
        monthKind: "weekdaysOfMonth",
        monthWeekdays: placement.weekdays,
      };
    case "daysOfYear":
      return { ...draft, yearKind: "daysOfYear", yearDays: placement.days };
  }
}

/** The period the popup saves: `interval` units, on the draft's placement. */
export function periodOf(
  interval: number,
  unit: RecurrenceUnit,
  draft: PlacementDraft,
): RecurrencePeriod {
  switch (unit) {
    case "day":
    case "weekday":
      return { interval, unit };
    case "week":
      return draft.weekDays.length === 0
        ? { interval, unit }
        : {
            interval,
            unit,
            placement: {
              kind: "daysOfWeek",
              days: [...draft.weekDays].sort((a, b) => a - b),
            },
          };
    case "month":
      if (draft.monthKind === "daysOfMonth" && draft.monthDays.length > 0) {
        return {
          interval,
          unit,
          placement: inOrder({ kind: "daysOfMonth", days: draft.monthDays }),
        };
      }
      if (draft.monthKind === "weekdaysOfMonth") {
        return {
          interval,
          unit,
          placement: inOrder({
            kind: "weekdaysOfMonth",
            weekdays: draft.monthWeekdays,
          }),
        };
      }
      return { interval, unit };
    case "year":
      return draft.yearKind === "same"
        ? { interval, unit }
        : {
            interval,
            unit,
            placement: inOrder({
              kind: "daysOfYear",
              days: draft.yearDays.map(({ month, day }) => ({
                month,
                day: Math.min(day, longestMonth(month)),
              })),
            }),
          };
  }
}

/** The most days a month can have: February has 29 in leap years. */
function longestMonth(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Monday to Sunday as toggle buttons, any number chosen; shared with the
 * review popup's placement (#105).
 */
export function DaysOfWeekPicker(props: {
  labelId: string;
  days: readonly DayOfWeek[];
  onChange: (days: readonly DayOfWeek[]) => void;
}) {
  const { labelId, days, onChange } = props;
  return (
    <fieldset
      className="nextaction-recurrence-popup-days"
      aria-labelledby={labelId}
    >
      {daysOfWeek.map((day) => {
        const chosen = days.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={chosen}
            className="nextaction-recurrence-popup-day"
            data-chosen={chosen || undefined}
            onClick={() =>
              onChange(chosen ? days.filter((d) => d !== day) : [...days, day])
            }
          >
            {dayOfWeekName(day)}
          </button>
        );
      })}
    </fieldset>
  );
}

/** A single-choice Orca Select over numbers or keys, labelled by `labelId`. */
export function Choice<V extends string | number>(props: {
  labelId: string;
  value: V;
  options: readonly V[];
  label: (value: V) => string;
  onChange: (value: V) => void;
}) {
  return (
    <fieldset
      className="nextaction-recurrence-popup-choice"
      aria-labelledby={props.labelId}
    >
      <Select
        selected={[String(props.value)]}
        options={props.options.map((value) => ({
          value: String(value),
          label: props.label(value),
        }))}
        alignment="left"
        onChange={(next) => {
          const chosen = props.options.find((o) => String(o) === next[0]);
          if (chosen !== undefined) props.onChange(chosen);
        }}
      />
    </fieldset>
  );
}

/** The placement choices for `unit`; nothing for days and weekdays. */
export function RecurrencePlacementField(props: {
  labelId: string;
  unit: RecurrenceUnit;
  draft: PlacementDraft;
  onChange: (draft: PlacementDraft) => void;
}) {
  const { Segmented } = orca.components;
  const { unit, draft, onChange, labelId } = props;
  if (unit === "day" || unit === "weekday") return null;
  const label = (
    <span className="nextaction-recurrence-popup-label" id={labelId}>
      {t("On")}
    </span>
  );

  if (unit === "week") {
    return (
      <div className="nextaction-recurrence-popup-field">
        {label}
        <DaysOfWeekPicker
          labelId={labelId}
          days={draft.weekDays}
          onChange={(weekDays) => onChange({ ...draft, weekDays })}
        />
        <div className="nextaction-recurrence-popup-hint">
          {t("None chosen: the weekday of the task's date.")}
        </div>
      </div>
    );
  }

  if (unit === "month") {
    // "Last day" is one of the days of the month: three choices fit a narrow
    // popup.
    const kinds = ["same", "daysOfMonth", "weekdaysOfMonth"] as const;
    const kindName = (kind: (typeof kinds)[number]): string => {
      switch (kind) {
        case "same":
          return t("Same day");
        case "daysOfMonth":
          return t("Day of the month");
        case "weekdaysOfMonth":
          return t("Day of the week");
      }
    };
    const skipsMonths =
      (draft.monthKind === "daysOfMonth" &&
        draft.monthDays.some((day) => day !== "last" && day > 28)) ||
      (draft.monthKind === "weekdaysOfMonth" &&
        draft.monthWeekdays.some((w) => w.ordinal === 5));
    return (
      <div className="nextaction-recurrence-popup-field">
        {label}
        <Segmented
          role="group"
          aria-labelledby={labelId}
          selected={draft.monthKind}
          options={kinds.map((value) => ({ value, label: kindName(value) }))}
          onChange={(value) => {
            const chosen = kinds.find((k) => k === value);
            if (chosen) onChange({ ...draft, monthKind: chosen });
          }}
        />
        {draft.monthKind === "same" && (
          <div className="nextaction-recurrence-popup-hint">
            {t("The day of the month of the task's date.")}
          </div>
        )}
        {draft.monthKind === "daysOfMonth" && (
          <>
            <DaysOfMonthPicker
              labelId={labelId}
              days={draft.monthDays}
              onChange={(monthDays) => onChange({ ...draft, monthDays })}
            />
            {draft.monthDays.length === 0 && (
              <div className="nextaction-recurrence-popup-hint">
                {t("None chosen: the day of the month of the task's date.")}
              </div>
            )}
          </>
        )}
        {draft.monthKind === "weekdaysOfMonth" && (
          <PlacementRows
            rows={draft.monthWeekdays}
            onChange={(monthWeekdays) => onChange({ ...draft, monthWeekdays })}
            // The next ordinal of the same weekday: "第二个周二" then "第三个周二".
            next={(last) => ({
              ordinal:
                last.ordinal === "last" || last.ordinal === 5
                  ? "last"
                  : ((last.ordinal + 1) as WeekdayOfMonth["ordinal"]),
              weekday: last.weekday,
            })}
            row={(row, change) => (
              <>
                <Choice
                  labelId={labelId}
                  value={row.ordinal}
                  options={weekdayOrdinals}
                  // "第二个周二" reads whole; the ordinal choice shows it with
                  // the weekday chosen.
                  label={(ordinal) => weekdayOfMonthText(ordinal, row.weekday)}
                  onChange={(ordinal) => change({ ...row, ordinal })}
                />
                <Choice
                  labelId={labelId}
                  value={row.weekday}
                  options={daysOfWeek}
                  label={dayOfWeekName}
                  onChange={(weekday) => change({ ...row, weekday })}
                />
              </>
            )}
          />
        )}
        {skipsMonths && (
          <div className="nextaction-recurrence-popup-hint">
            {t(
              "Months without that day are skipped. To land in every month, choose the last day or the last day of the week.",
            )}
          </div>
        )}
      </div>
    );
  }

  // A year.
  return (
    <div className="nextaction-recurrence-popup-field">
      {label}
      <Segmented
        role="group"
        aria-labelledby={labelId}
        selected={draft.yearKind}
        options={[
          { value: "same", label: t("Same day") },
          { value: "daysOfYear", label: t("Month and day") },
        ]}
        onChange={(value) =>
          onChange({
            ...draft,
            yearKind: value === "daysOfYear" ? "daysOfYear" : "same",
          })
        }
      />
      {draft.yearKind === "same" ? (
        <div className="nextaction-recurrence-popup-hint">
          {t("The month and day of the task's date.")}
        </div>
      ) : (
        <PlacementRows
          rows={draft.yearDays}
          onChange={(yearDays) => onChange({ ...draft, yearDays })}
          // The same day of the month after.
          next={(last) => ({ month: (last.month % 12) + 1, day: last.day })}
          row={(row, change) => (
            <>
              <Choice
                labelId={labelId}
                value={row.month}
                options={range(1, 12)}
                label={monthName}
                onChange={(month) =>
                  change({ month, day: Math.min(row.day, longestMonth(month)) })
                }
              />
              <Choice
                labelId={labelId}
                value={Math.min(row.day, longestMonth(row.month))}
                options={range(1, longestMonth(row.month))}
                label={(day) => t("day ${day}", { day: String(day) })}
                onChange={(day) => change({ ...row, day })}
              />
            </>
          )}
        />
      )}
      {draft.yearKind === "daysOfYear" &&
        draft.yearDays.some(({ month, day }) => month === 2 && day === 29) && (
          <div className="nextaction-recurrence-popup-hint">
            {t("Years without February 29 are skipped.")}
          </div>
        )}
    </div>
  );
}

/** The days of the month 1 to 31 and the last day as toggles, any number chosen. */
function DaysOfMonthPicker(props: {
  labelId: string;
  days: readonly DayOfMonth[];
  onChange: (days: readonly DayOfMonth[]) => void;
}) {
  const { labelId, days, onChange } = props;
  const all: readonly DayOfMonth[] = [...range(1, 31), "last"];
  return (
    <fieldset
      className="nextaction-recurrence-popup-month-days"
      aria-labelledby={labelId}
    >
      {all.map((day) => {
        const chosen = days.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={chosen}
            aria-label={dayOfMonthName(day)}
            className="nextaction-recurrence-popup-day"
            data-chosen={chosen || undefined}
            data-last={day === "last" || undefined}
            onClick={() =>
              onChange(chosen ? days.filter((d) => d !== day) : [...days, day])
            }
          >
            {day === "last" ? t("Last day") : day}
          </button>
        );
      })}
    </fieldset>
  );
}

/**
 * Rows of choices, one placement each, with a button to remove a row (but
 * the last one) and one to add a row after them, preset by `next`.
 */
function PlacementRows<R>(props: {
  rows: readonly R[];
  onChange: (rows: readonly R[]) => void;
  next: (last: R) => R;
  row: (row: R, change: (row: R) => void) => React.ReactNode;
}) {
  const { Button, Tooltip } = orca.components;
  const { rows, onChange } = props;
  const last = rows[rows.length - 1];
  return (
    <div className="nextaction-recurrence-popup-rows">
      {rows.map((row, index) => (
        // Rows have no identity of their own; two rows may be alike.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <div className="nextaction-recurrence-popup-row" key={index}>
          {props.row(row, (changed) =>
            onChange(rows.map((r, i) => (i === index ? changed : r))),
          )}
          {rows.length > 1 && (
            <Tooltip text={t("Remove")}>
              <Button
                variant="plain"
                aria-label={t("Remove")}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                <i className="ti ti-x" aria-hidden="true" />
              </Button>
            </Tooltip>
          )}
        </div>
      ))}
      {last !== undefined && (
        <div>
          <Button
            variant="plain"
            onClick={() => onChange([...rows, props.next(last)])}
          >
            <i className="ti ti-plus" aria-hidden="true" /> {t("Add")}
          </Button>
        </div>
      )}
    </div>
  );
}
