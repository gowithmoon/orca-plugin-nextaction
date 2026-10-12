// The task panel's custom properties group (GLOSSARY: 自定义属性, #113): one
// row per property the task tag defines, in Orca's order, each shaped like
// the panel's built-in field of its kind. Property names are shown as the
// notes hold them (ADR 0009 is about the plugin's own names). Choice and
// block reference properties are not shown yet (#114, #115). Verified by
// hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { TaskCustomProperty } from "../../application/usecases/read-task";
import type { CustomPropertyValue } from "../../domain/task/custom-property";
import type { CalendarDate } from "../../domain/task/task";
import type { TimeOfDay } from "../../domain/time/time-of-day";
import { t } from "../../shared/l10n/l10n";
import { formatClock } from "../components/format";
import { DatePicker } from "../components/popup-controls";
import { formatMoment } from "../components/reminder-text";
import { DateField, Field, NoteField } from "./task-panel-fields";

/** The kinds this group shows so far. */
const shownKinds = new Set<CustomPropertyValue["kind"]>([
  "text",
  "number",
  "boolean",
  "date",
  "datetime",
  "time",
]);

/**
 * The custom properties group, after the built-in fields; nothing when the
 * task tag defines none of the kinds shown.
 */
export function CustomPropertiesField(props: {
  idPrefix: string;
  properties: readonly TaskCustomProperty[];
  today: CalendarDate;
  saveOnLeave: () => boolean;
  /** Resolves to whether the write succeeded. */
  onChange: (name: string, value: CustomPropertyValue) => Promise<boolean>;
}) {
  const shown = props.properties.filter((p) => shownKinds.has(p.value.kind));
  if (shown.length === 0) return null;
  const headingId = `${props.idPrefix}-custom-properties`;
  return (
    <section
      className="nextaction-custom-properties"
      aria-labelledby={headingId}
    >
      <div className="nextaction-custom-properties-heading" id={headingId}>
        {t("Custom properties")}
      </div>
      {shown.map((property, index) => {
        // Names are free text; the index keeps label IDs valid and unique.
        const labelId = `${headingId}-${index}`;
        return (
          <Field
            key={property.definition.name}
            label={property.definition.name}
            labelId={labelId}
          >
            <CustomPropertyControl
              labelId={labelId}
              value={property.value}
              today={props.today}
              saveOnLeave={props.saveOnLeave}
              onChange={(value) =>
                props.onChange(property.definition.name, value)
              }
            />
          </Field>
        );
      })}
    </section>
  );
}

function CustomPropertyControl(props: {
  labelId: string;
  value: CustomPropertyValue;
  today: CalendarDate;
  saveOnLeave: () => boolean;
  onChange: (value: CustomPropertyValue) => Promise<boolean>;
}) {
  const { value, onChange } = props;
  switch (value.kind) {
    case "text":
      return (
        <NoteField
          labelId={props.labelId}
          note={value.value}
          placeholder={t("Not set")}
          onSave={(text) => onChange({ kind: "text", value: text })}
          saveOnLeave={props.saveOnLeave}
        />
      );
    case "number":
      return (
        <NumberField
          labelId={props.labelId}
          value={value.value}
          onSave={(number) => void onChange({ kind: "number", value: number })}
        />
      );
    case "boolean":
      return (
        <BooleanField
          labelId={props.labelId}
          on={value.value}
          onChange={(on) => void onChange({ kind: "boolean", value: on })}
        />
      );
    case "date":
      return (
        <DateField
          labelId={props.labelId}
          value={value.value}
          today={props.today}
          onChange={(date) => void onChange({ kind: "date", value: date })}
        />
      );
    case "datetime":
      return (
        <MomentField
          labelId={props.labelId}
          mode="datetime"
          value={value.value}
          shown={value.value && formatMoment(value.value, props.today)}
          onChange={(at) => void onChange({ kind: "datetime", value: at })}
        />
      );
    case "time":
      return (
        <MomentField
          labelId={props.labelId}
          mode="time"
          value={value.value && onToday(props.today, value.value)}
          shown={value.value && formatTime(value.value)}
          onChange={(at) =>
            void onChange({
              kind: "time",
              value: at && { hours: at.getHours(), minutes: at.getMinutes() },
            })
          }
        />
      );
    default:
      return null;
  }
}

/** A time of day as "9:05". */
function formatTime(time: TimeOfDay): string {
  return formatClock(new Date(2000, 0, 1, time.hours, time.minutes));
}

/** `time` on `today`, for the picker, which needs a whole date. */
function onToday(today: CalendarDate, time: TimeOfDay): Date {
  return new Date(
    today.year,
    today.month - 1,
    today.day,
    time.hours,
    time.minutes,
  );
}

/**
 * A number typed: empty clears it (`null`), a finite number is kept,
 * anything else is refused (`undefined`).
 */
function typedNumber(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * A number, saved on Enter or when it loses focus, each save one write.
 * Empty clears it; what is not a number shows what the notes hold again,
 * writing nothing.
 */
function NumberField(props: {
  labelId: string;
  value: number | null;
  onSave: (value: number | null) => void;
}) {
  const { Input } = orca.components;
  const fromNotes = props.value === null ? "" : String(props.value);
  const [draft, setDraft] = React.useState(fromNotes);
  const focused = React.useRef(false);
  // The notes changed (e.g. elsewhere): show it, unless the user is typing.
  React.useEffect(() => {
    if (!focused.current) setDraft(fromNotes);
  }, [fromNotes]);

  const save = () => {
    const number = typedNumber(draft);
    if (number === undefined || number === props.value) {
      setDraft(fromNotes);
      return;
    }
    props.onSave(number);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-labelledby={props.labelId}
      placeholder={t("Not set")}
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
        if (e.nativeEvent.isComposing || e.key !== "Enter") return;
        e.preventDefault();
        save();
      }}
    />
  );
}

/** A boolean: Orca's switch, as sequential. */
function BooleanField(props: {
  labelId: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  const { Switch } = orca.components;
  return (
    <Switch
      role="switch"
      aria-checked={props.on}
      aria-labelledby={props.labelId}
      on={props.on}
      onChange={(on) => {
        if (on !== props.on) props.onChange(on);
      }}
    />
  );
}

/**
 * A date and time, or a time of day, with Orca's picker in that mode, and a
 * clear button. `shown` is how the value reads.
 */
function MomentField(props: {
  labelId: string;
  mode: "datetime" | "time";
  value: Date | null;
  shown: string | null;
  onChange: (at: Date | null) => void;
}) {
  const { Button } = orca.components;
  const [picking, setPicking] = React.useState(false);
  // A wrapper element anchors the picker, as in DateField.
  const anchor = React.useRef<HTMLSpanElement>(null);
  const valueId = `${props.labelId}-value`;
  return (
    <div className="nextaction-date-field">
      <span ref={anchor} className="nextaction-date-trigger">
        <Button
          id={valueId}
          className="nextaction-date-button"
          variant="outline"
          aria-labelledby={`${props.labelId} ${valueId}`}
          aria-haspopup="dialog"
          aria-expanded={picking}
          data-empty={props.value ? undefined : true}
          onClick={() => setPicking((open) => !open)}
        >
          <i
            className={
              props.mode === "time" ? "ti ti-clock" : "ti ti-calendar-time"
            }
            aria-hidden="true"
          />
          {props.shown ?? t("Not set")}
        </Button>
      </span>
      {props.value && (
        <Button
          variant="plain"
          aria-label={t("Clear")}
          title={t("Clear")}
          onClick={() => props.onChange(null)}
        >
          <i className="ti ti-x" aria-hidden="true" />
        </Button>
      )}
      {picking && (
        <DatePicker
          mode={props.mode}
          // The picker needs a value: an empty one starts now.
          value={props.value ?? new Date()}
          refElement={anchor}
          visible={true}
          onClose={() => setPicking(false)}
          onChange={(picked) => {
            setPicking(false);
            if (!(picked instanceof Date)) return;
            if (props.value?.getTime() !== picked.getTime()) {
              props.onChange(picked);
            }
          }}
        />
      )}
    </div>
  );
}
