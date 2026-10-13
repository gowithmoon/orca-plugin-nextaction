// The reminder popup (GLOSSARY: 提醒, #107): the quick options (the due and
// start dates' days at the reminder default time) as toggles and a custom
// date and time to add, then the task's reminders in order, each with its
// time to change and a delete button, the passed ones greyed. The parts to
// pick from stay put while the list grows below them. Saving writes the list in one
// undo; "Clear all" removes every reminder. Moments not later than now
// cannot be added. In a plugin window, rendered into its own React root, as
// the review popup. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ReminderDefaultTimeSetting } from "../../application/ports/reminder-default-time-setting";
import type { SetReminders } from "../../application/usecases/set-reminders";
import {
  normalizeReminders,
  quickReminderOptions,
  type Reminders,
  remindersIn,
} from "../../domain/reminder/reminder";
import type { CalendarDate, Task } from "../../domain/task/task";
import { addDays } from "../../domain/time/calendar-days";
import {
  calendarDateOf,
  momentOnDate,
  type TimeOfDay,
} from "../../domain/time/time-of-day";
import { t } from "../../shared/l10n/l10n";
import {
  createTaskWindow,
  PluginWindow,
  WindowFooter,
  WindowHeader,
  WindowSpacer,
} from "../components/plugin-window";
import { DatePicker } from "../components/popup-controls";
import { formatMoment, quickOptionName } from "../components/reminder-text";
import {
  type DiscardUnreadableDeps,
  useDiscardUnreadable,
} from "../hooks/use-discard-unreadable";
import { useNow } from "../hooks/use-now";
import { type Notify, notifySetRemindersFailure } from "../notify";
import { DiscardUnreadableField } from "./discard-unreadable-field";

export interface ReminderPopupDeps {
  /** Writes the task's reminders (#107). */
  setReminders: SetReminders;
  /** The time of day the quick options fall at. */
  reminderDefaultTime: ReminderDefaultTimeSetting;
  /** The current time: which reminders have passed, which can be added. */
  now: () => Date;
  /** The current logical day, for showing dates. */
  today: () => CalendarDate;
  notify: Notify;
  /** Discards the task's data when it cannot be read (#106). */
  discard: DiscardUnreadableDeps;
}

/** Opens the popup for `task`, replacing one already open. */
export type OpenReminderPopup = (task: Task) => void;

const later = (at: Date, now: Date) => at.getTime() > now.getTime();
const has = (list: Reminders, at: Date) =>
  list.some((moment) => moment.getTime() === at.getTime());

/**
 * Where the custom moment starts: today at the reminder default time, or
 * tomorrow's when that has passed.
 */
function customStart(now: Date, time: TimeOfDay): Date {
  const today = calendarDateOf(now);
  const onToday = momentOnDate(today, time);
  if (later(onToday, now)) return onToday;
  return momentOnDate(addDays(today, 1), time);
}

/**
 * A moment with Orca's date and time picker: a button showing it that opens
 * the picker. The picker's popup goes into the window's popup layer
 * (popup-controls), so the window does not clip it.
 */
function MomentButton(props: {
  at: Date;
  today: CalendarDate;
  label: string;
  passed?: boolean;
  onChange: (at: Date) => void;
}) {
  const { Button } = orca.components;
  const [picking, setPicking] = React.useState(false);
  // A wrapper element anchors the picker, as the date field's does.
  const anchor = React.useRef<HTMLSpanElement>(null);
  return (
    <span ref={anchor} className="nextaction-reminder-moment">
      <Button
        variant="outline"
        className="nextaction-reminder-moment-button"
        aria-label={props.label}
        aria-haspopup="dialog"
        aria-expanded={picking}
        data-passed={props.passed || undefined}
        onClick={() => setPicking((open) => !open)}
      >
        <i className="ti ti-clock" aria-hidden="true" />
        {formatMoment(props.at, props.today)}
      </Button>
      {picking && (
        <DatePicker
          mode="datetime"
          value={props.at}
          refElement={anchor}
          visible={true}
          onClose={() => setPicking(false)}
          onChange={(picked) => {
            if (!(picked instanceof Date) || Number.isNaN(picked.getTime())) {
              return;
            }
            // Whole minutes, as the reminder default time.
            const at = new Date(picked);
            at.setSeconds(0, 0);
            props.onChange(at);
          }}
        />
      )}
    </span>
  );
}

function ReminderPopup(props: {
  task: Task;
  deps: ReminderPopupDeps;
  onClose: () => void;
  /** Shows the popup afresh for the task as read again. */
  onReopen: (task: Task) => void;
}) {
  const { task, deps, onClose, onReopen } = props;
  const { Button, Tooltip } = orca.components;
  const idPrefix = React.useId();
  const id = (field: string) => `${idPrefix}-${field}`;
  const now = useNow(deps.now);
  const today = deps.today();
  const original = remindersIn(task.reminders);
  const [draft, setDraft] = React.useState<Reminders>(original);
  const [custom, setCustom] = React.useState(() =>
    customStart(deps.now(), deps.reminderDefaultTime.current()),
  );
  const [busy, setBusy] = React.useState(false);
  // Discarded (#106): shown afresh with the empty value to edit, or closed
  // when the block is no longer a task.
  const discard = useDiscardUnreadable(
    deps.discard,
    task.id,
    "reminders",
    React.useCallback(
      (read: Task | null) => (read ? onReopen(read) : onClose()),
      [onReopen, onClose],
    ),
  );

  // Unreadable reminders cannot be overwritten (the use case refuses); the
  // popup says so instead of offering a save that would fail.
  const unreadable = task.reminders.kind === "unreadable";
  // A moment can join the list when it is later than now, or was one of the
  // task's own (a passed reminder may stay).
  const addable = (at: Date) => later(at, now) || has(original, at);
  const options = quickReminderOptions(
    task,
    deps.reminderDefaultTime.current(),
    now,
  );
  const unchanged =
    draft.length === original.length &&
    draft.every((moment, i) => moment.getTime() === original[i]?.getTime());

  const add = (at: Date) =>
    setDraft((list) => normalizeReminders([...list, at]));
  const replace = (from: Date, to: Date) =>
    setDraft((list) =>
      normalizeReminders([
        ...list.filter((moment) => moment.getTime() !== from.getTime()),
        to,
      ]),
    );
  const remove = (at: Date) =>
    setDraft((list) =>
      list.filter((moment) => moment.getTime() !== at.getTime()),
    );
  const pastNotice = () =>
    deps.notify("warn", t("A reminder cannot be set in the past."));

  const write = async (next: Reminders) => {
    if (busy || unreadable) return;
    setBusy(true);
    try {
      await deps.setReminders(task.id, next);
      onClose();
    } catch (error) {
      // The popup stays, with what was chosen.
      notifySetRemindersFailure(deps.notify, error);
      setBusy(false);
    }
  };
  const save = () => {
    // Nothing changed: nothing to undo either.
    if (unchanged) onClose();
    else void write(draft);
  };

  return (
    <PluginWindow
      onClose={onClose}
      className="nextaction-recurrence-popup nextaction-reminder-popup"
      labelledBy={id("title")}
    >
      <WindowHeader
        title={t("Reminders")}
        titleId={id("title")}
        task={task}
        onClose={onClose}
      />
      <div className="nextaction-recurrence-popup-body">
        {task.reminders.kind === "unreadable" && (
          <div className="nextaction-recurrence-popup-warning">
            {t(
              "This task's reminders cannot be read (${reason}). They are kept as they are and cannot be changed here.",
              { reason: task.reminders.reason },
            )}
          </div>
        )}
        {unreadable && (
          <DiscardUnreadableField
            busy={discard.busy}
            onDiscard={discard.discard}
          />
        )}
        {/* The parts to pick from come first and keep their size; only the
                list below grows, so picking several in a row never moves them. */}
        {options.length > 0 && (
          <div className="nextaction-recurrence-popup-field">
            <span
              className="nextaction-recurrence-popup-label"
              id={id("quick")}
            >
              {t("Quick add")}
            </span>
            <fieldset
              className="nextaction-reminder-options"
              aria-labelledby={id("quick")}
            >
              {options.map((option) => {
                const added = has(draft, option.at);
                const name = quickOptionName(option);
                // A toggle: chosen again, it takes its reminder out. Its
                // text never changes, so the grid keeps its shape.
                return (
                  <Tooltip
                    key={`${option.from}:${option.daysBefore}`}
                    text={formatMoment(option.at, today)}
                  >
                    <button
                      type="button"
                      className="nextaction-reminder-option"
                      aria-pressed={added}
                      data-chosen={added || undefined}
                      disabled={!added && !option.selectable}
                      aria-label={
                        !added && !option.selectable
                          ? t("${name} (passed)", { name })
                          : name
                      }
                      onClick={() =>
                        added ? remove(option.at) : add(option.at)
                      }
                    >
                      <i
                        className="ti ti-check nextaction-reminder-option-check"
                        aria-hidden="true"
                      />
                      {name}
                    </button>
                  </Tooltip>
                );
              })}
            </fieldset>
          </div>
        )}
        <div className="nextaction-recurrence-popup-field">
          <span className="nextaction-recurrence-popup-label" id={id("custom")}>
            {t("Custom")}
          </span>
          <div className="nextaction-reminder-custom">
            <MomentButton
              at={custom}
              today={today}
              label={t("Choose the date and time")}
              onChange={setCustom}
            />
            <Button
              variant="outline"
              disabled={!later(custom, now) || has(draft, custom)}
              onClick={() => add(custom)}
            >
              <i className="ti ti-plus" aria-hidden="true" />
              {t("Add")}
            </Button>
          </div>
          {!later(custom, now) && (
            <div className="nextaction-recurrence-popup-hint">
              {t("A reminder cannot be set in the past.")}
            </div>
          )}
        </div>
        <div className="nextaction-recurrence-popup-field">
          <span className="nextaction-recurrence-popup-label" id={id("list")}>
            {t("Reminders")}
          </span>
          {draft.length === 0 ? (
            <span className="nextaction-recurrence-popup-hint">
              {t("No reminders yet")}
            </span>
          ) : (
            <ul
              className="nextaction-reminder-list"
              aria-labelledby={id("list")}
            >
              {draft.map((at) => {
                const passed = !later(at, now);
                const moment = formatMoment(at, today);
                return (
                  <li
                    key={at.getTime()}
                    className="nextaction-reminder-item"
                    data-passed={passed || undefined}
                  >
                    <MomentButton
                      at={at}
                      today={today}
                      passed={passed}
                      label={t("Change the time of the reminder at ${moment}", {
                        moment,
                      })}
                      onChange={(to) => {
                        if (to.getTime() === at.getTime()) return;
                        if (!addable(to)) pastNotice();
                        else replace(at, to);
                      }}
                    />
                    {passed && (
                      <span className="nextaction-reminder-passed">
                        {t("Passed")}
                      </span>
                    )}
                    <Tooltip text={t("Delete reminder")}>
                      <Button
                        variant="plain"
                        aria-label={t("Delete the reminder at ${moment}", {
                          moment,
                        })}
                        onClick={() => remove(at)}
                      >
                        <i className="ti ti-trash" aria-hidden="true" />
                      </Button>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <WindowFooter>
        {original.length > 0 && (
          <Button
            variant="plain"
            disabled={busy || unreadable}
            onClick={() => void write([])}
          >
            {t("Clear all")}
          </Button>
        )}
        <WindowSpacer />
        <Button variant="plain" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button variant="solid" disabled={unreadable || busy} onClick={save}>
          {t("Save")}
        </Button>
      </WindowFooter>
    </PluginWindow>
  );
}

/** The popup in `render`'s root; at most one at a time. */
export function createReminderPopup(options: {
  deps: ReminderPopupDeps;
  render: (node: React.ReactNode) => void;
}): OpenReminderPopup {
  return createTaskWindow(ReminderPopup, options);
}
