// The task panel's field controls (#35 "任务属性面板"): status buttons,
// seven-cell ratings, dates and the note. Each change is one write. Verified
// by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { CalendarDate, Rating, TaskStatus } from "../../domain/task/task";
import { taskStatuses } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { formatDate } from "../components/format";
import { statusLabel } from "../components/status-label";
import { statusIcons } from "../task-menu/status-icons";

const ratings: readonly Rating[] = [1, 2, 3, 4, 5, 6, 7];
/** Importance and effort default to 4 (GLOSSARY). */
const defaultRating: Rating = 4;

/** A labelled field: label to the left on a wide panel, above it otherwise (CSS). */
export function Field(props: {
  label: string;
  /** Labels the control group, e.g. a radio group's `aria-labelledby`. */
  labelId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="nextaction-task-field">
      <div className="nextaction-task-field-label" id={props.labelId}>
        {props.label}
      </div>
      <div className="nextaction-task-field-control">{props.children}</div>
    </div>
  );
}

/** Six buttons in the status colours; the current one stands out. */
export function StatusField(props: {
  labelId: string;
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
}) {
  return (
    <fieldset
      className="nextaction-status-buttons"
      aria-labelledby={props.labelId}
    >
      {taskStatuses.map((status) => {
        const icon = statusIcons[status];
        const current = status === props.status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={current}
            className="nextaction-status-button"
            data-current={current || undefined}
            style={
              {
                "--nextaction-status-color": icon.color,
              } as React.CSSProperties
            }
            // Choosing the current status writes nothing.
            onClick={() => current || props.onChange(status)}
          >
            <i className={icon.className} aria-hidden="true" />
            <span className="nextaction-status-button-label">
              {statusLabel(status)}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}

/** Seven cells; the chosen level's name beside them, the default 4 marked. */
export function RatingField(props: {
  labelId: string;
  value: Rating;
  name: (level: Rating) => string;
  onChange: (level: Rating) => void;
}) {
  const { Tooltip } = orca.components;
  return (
    <div className="nextaction-rating">
      <fieldset
        className="nextaction-rating-cells"
        aria-labelledby={props.labelId}
      >
        {ratings.map((level) => {
          const hint = t("${value} · ${name}", {
            value: String(level),
            name: props.name(level),
          });
          return (
            <Tooltip key={level} text={hint}>
              <button
                type="button"
                aria-pressed={level === props.value}
                aria-label={hint}
                className="nextaction-rating-cell"
                data-filled={level <= props.value || undefined}
                data-current={level === props.value || undefined}
                data-default={level === defaultRating || undefined}
                onClick={() => level === props.value || props.onChange(level)}
              />
            </Tooltip>
          );
        })}
      </fieldset>
      <span className="nextaction-rating-name">{props.name(props.value)}</span>
    </div>
  );
}

function toCalendarDate(date: Date): CalendarDate {
  // The picker gives a local date; only its local year, month and day count (ADR 0012).
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function toLocalDate(date: CalendarDate): Date {
  return new Date(date.year, date.month - 1, date.day);
}

/**
 * A date with Orca's date picker, its weekday beside it, and a clear button.
 * `overdue` shows it in red.
 */
export function DateField(props: {
  labelId: string;
  value: CalendarDate | null;
  today: CalendarDate;
  overdue?: boolean;
  onChange: (date: CalendarDate | null) => void;
}) {
  const { Button, DatePicker } = orca.components;
  const [picking, setPicking] = React.useState(false);
  // A wrapper element anchors the picker: whether Orca's Button forwards a ref is unknown.
  const anchor = React.useRef<HTMLSpanElement>(null);
  const { value } = props;
  const valueId = `${props.labelId}-value`;

  return (
    <div className="nextaction-date-field">
      <span ref={anchor} className="nextaction-date-trigger">
        <Button
          id={valueId}
          variant="outline"
          // Named by the field label and the date it shows.
          aria-labelledby={`${props.labelId} ${valueId}`}
          aria-haspopup="dialog"
          aria-expanded={picking}
          data-overdue={props.overdue || undefined}
          onClick={() => setPicking((open) => !open)}
        >
          <i className="ti ti-calendar" aria-hidden="true" />
          {value ? formatDate(value, props.today) : t("Not set")}
        </Button>
      </span>
      {props.overdue && (
        <span className="nextaction-property-overdue">{t("Overdue")}</span>
      )}
      {value && (
        <Button
          variant="plain"
          aria-label={t("Clear date")}
          title={t("Clear date")}
          onClick={() => props.onChange(null)}
        >
          <i className="ti ti-x" aria-hidden="true" />
        </Button>
      )}
      {picking && (
        <DatePicker
          mode="date"
          // The picker needs a date: an empty value starts on today.
          value={toLocalDate(value ?? props.today)}
          refElement={anchor}
          visible={true}
          onClose={() => setPicking(false)}
          onChange={(picked) => {
            setPicking(false);
            if (!(picked instanceof Date)) return;
            const date = toCalendarDate(picked);
            const same =
              value &&
              value.year === date.year &&
              value.month === date.month &&
              value.day === date.day;
            if (!same) props.onChange(date);
          }}
        />
      )}
    </div>
  );
}

/**
 * The note: a one-line input saved on Enter or when it loses focus, then
 * "Saved" shows briefly. While it has focus, what the notes hold does not
 * replace what is being typed. Leaving the panel with unsaved text saves it
 * when `saveOnLeave()` allows (not after the task went away).
 */
export function NoteField(props: {
  labelId: string;
  note: string | null;
  /** Resolves to whether the write succeeded. */
  onSave: (note: string | null) => Promise<boolean>;
  saveOnLeave: () => boolean;
}) {
  const { CompositionInput } = orca.components;
  const fromNotes = props.note ?? "";
  const [draft, setDraft] = React.useState(fromNotes);
  const focused = React.useRef(false);
  /** What was last read or written, so one edit is written once. */
  const saved = React.useRef(fromNotes);
  /** Counts saves: each one restarts the "Saved" fade-out (a CSS animation, no timer). */
  const [savedCount, setSavedCount] = React.useState(0);

  const latestFromNotes = React.useRef(fromNotes);
  latestFromNotes.current = fromNotes;
  // The notes changed (e.g. elsewhere): show it, unless the user is typing.
  React.useEffect(() => {
    if (focused.current) return;
    saved.current = fromNotes;
    setDraft(fromNotes);
  }, [fromNotes]);

  const save = React.useCallback(
    async (text: string) => {
      if (text === saved.current) return;
      const previous = saved.current;
      saved.current = text;
      if (await props.onSave(text === "" ? null : text)) {
        setSavedCount((count) => count + 1);
      } else {
        saved.current = previous;
      }
    },
    [props.onSave],
  );

  // Leaving with unsaved text (Esc, the close button) still saves it.
  const latest = React.useRef({ draft, save, saveOnLeave: props.saveOnLeave });
  latest.current = { draft, save, saveOnLeave: props.saveOnLeave };
  React.useEffect(
    () => () => {
      const { draft: text, save: write, saveOnLeave } = latest.current;
      if (text !== saved.current && saveOnLeave()) void write(text);
    },
    [],
  );

  return (
    <div className="nextaction-note-field">
      <CompositionInput
        aria-labelledby={props.labelId}
        placeholder={t("A line about this task")}
        value={draft}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setDraft(e.target.value)
        }
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          if (draft !== saved.current) {
            void save(draft);
            return;
          }
          // Nothing typed: show what the notes came to hold meanwhile.
          saved.current = latestFromNotes.current;
          setDraft(latestFromNotes.current);
        }}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          // Enter that confirms an IME composition is not a save.
          if (e.nativeEvent.isComposing || e.key !== "Enter") return;
          e.preventDefault();
          void save(draft);
        }}
      />
      {savedCount > 0 && (
        <span key={savedCount} className="nextaction-note-saved" role="status">
          {t("Saved")}
        </span>
      )}
    </div>
  );
}
