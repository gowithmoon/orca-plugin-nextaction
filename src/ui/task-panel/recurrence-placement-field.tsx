// The placement part of the recurrence rule popup (GLOSSARY: 重复规则, #88):
// which days of the week, which day of the month, which day of the year a
// period falls on. Days and weekdays have none. Without one chosen, the
// period falls on the day matching the task's date. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import {
  type DayOfWeek,
  daysOfWeek,
  type RecurrencePeriod,
  type RecurrenceUnit,
  type WeekdayOrdinal,
  weekdayOrdinals,
} from "../../domain/recurrence/recurrence";
import type { CalendarDate } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { Select } from "../components/popup-controls";
import {
  dayOfWeekName,
  monthName,
  weekdayOfMonthText,
} from "../components/recurrence-text";

/** What the popup holds for each unit's placement while the rule is edited. */
export interface PlacementDraft {
  /** No days: the weekday of the task's date. */
  readonly weekDays: readonly DayOfWeek[];
  readonly monthKind:
    | "same"
    | "dayOfMonth"
    | "lastDayOfMonth"
    | "weekdayOfMonth";
  readonly monthDay: number;
  readonly ordinal: WeekdayOrdinal;
  readonly weekday: DayOfWeek;
  readonly yearKind: "same" | "dayOfYear";
  readonly yearMonth: number;
  readonly yearDay: number;
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
    monthDay: day.day,
    ordinal: 1,
    weekday: 1,
    yearKind: "same",
    yearMonth: day.month,
    yearDay: day.day,
  };
  if (period === undefined || !("placement" in period) || !period.placement) {
    return draft;
  }
  const placement = period.placement;
  switch (placement.kind) {
    case "daysOfWeek":
      return { ...draft, weekDays: placement.days };
    case "dayOfMonth":
      return { ...draft, monthKind: "dayOfMonth", monthDay: placement.day };
    case "lastDayOfMonth":
      return { ...draft, monthKind: "lastDayOfMonth" };
    case "weekdayOfMonth":
      return {
        ...draft,
        monthKind: "weekdayOfMonth",
        ordinal: placement.ordinal,
        weekday: placement.weekday,
      };
    case "dayOfYear":
      return {
        ...draft,
        yearKind: "dayOfYear",
        yearMonth: placement.month,
        yearDay: placement.day,
      };
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
      switch (draft.monthKind) {
        case "same":
          return { interval, unit };
        case "dayOfMonth":
          return {
            interval,
            unit,
            placement: { kind: "dayOfMonth", day: draft.monthDay },
          };
        case "lastDayOfMonth":
          return { interval, unit, placement: { kind: "lastDayOfMonth" } };
        case "weekdayOfMonth":
          return {
            interval,
            unit,
            placement: {
              kind: "weekdayOfMonth",
              ordinal: draft.ordinal,
              weekday: draft.weekday,
            },
          };
      }
      break;
    case "year":
      return draft.yearKind === "same"
        ? { interval, unit }
        : {
            interval,
            unit,
            placement: {
              kind: "dayOfYear",
              month: draft.yearMonth,
              day: Math.min(draft.yearDay, longestMonth(draft.yearMonth)),
            },
          };
  }
  return { interval, unit };
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
    const kinds = [
      "same",
      "dayOfMonth",
      "lastDayOfMonth",
      "weekdayOfMonth",
    ] as const;
    const kindName = (kind: (typeof kinds)[number]): string => {
      switch (kind) {
        case "same":
          return t("Same day");
        case "dayOfMonth":
          return t("Day of the month");
        case "lastDayOfMonth":
          return t("Last day");
        case "weekdayOfMonth":
          return t("Day of the week");
      }
    };
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
        {draft.monthKind === "dayOfMonth" && (
          <div className="nextaction-recurrence-popup-period">
            <Choice
              labelId={labelId}
              value={draft.monthDay}
              options={range(1, 31)}
              label={(day) => t("day ${day}", { day: String(day) })}
              onChange={(monthDay) => onChange({ ...draft, monthDay })}
            />
          </div>
        )}
        {draft.monthKind === "weekdayOfMonth" && (
          <div className="nextaction-recurrence-popup-period">
            <Choice
              labelId={labelId}
              value={draft.ordinal}
              options={weekdayOrdinals}
              // "第二个周二" reads whole; the ordinal choice shows it with the
              // weekday chosen.
              label={(ordinal) => weekdayOfMonthText(ordinal, draft.weekday)}
              onChange={(ordinal) => onChange({ ...draft, ordinal })}
            />
            <Choice
              labelId={labelId}
              value={draft.weekday}
              options={daysOfWeek}
              label={dayOfWeekName}
              onChange={(weekday) => onChange({ ...draft, weekday })}
            />
          </div>
        )}
        {(draft.monthKind === "dayOfMonth" && draft.monthDay > 28) ||
        (draft.monthKind === "weekdayOfMonth" && draft.ordinal === 5) ? (
          <div className="nextaction-recurrence-popup-hint">
            {t(
              "Months without that day are skipped. To land in every month, choose the last day or the last day of the week.",
            )}
          </div>
        ) : null}
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
          { value: "dayOfYear", label: t("Month and day") },
        ]}
        onChange={(value) =>
          onChange({
            ...draft,
            yearKind: value === "dayOfYear" ? "dayOfYear" : "same",
          })
        }
      />
      {draft.yearKind === "same" ? (
        <div className="nextaction-recurrence-popup-hint">
          {t("The month and day of the task's date.")}
        </div>
      ) : (
        <div className="nextaction-recurrence-popup-period">
          <Choice
            labelId={labelId}
            value={draft.yearMonth}
            options={range(1, 12)}
            label={monthName}
            onChange={(yearMonth) =>
              onChange({
                ...draft,
                yearMonth,
                yearDay: Math.min(draft.yearDay, longestMonth(yearMonth)),
              })
            }
          />
          <Choice
            labelId={labelId}
            value={Math.min(draft.yearDay, longestMonth(draft.yearMonth))}
            options={range(1, longestMonth(draft.yearMonth))}
            label={(day) => t("day ${day}", { day: String(day) })}
            onChange={(yearDay) => onChange({ ...draft, yearDay })}
          />
        </div>
      )}
      {draft.yearKind === "dayOfYear" &&
        draft.yearMonth === 2 &&
        draft.yearDay === 29 && (
          <div className="nextaction-recurrence-popup-hint">
            {t("Years without February 29 are skipped.")}
          </div>
        )}
    </div>
  );
}
