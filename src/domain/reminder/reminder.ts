// Reminders (GLOSSARY: 提醒). Pure: the current time is passed in as `now`.
// A reminder is an absolute moment; quick options turn a due or start date
// into one on the calendar day (not the logical day), local time (ADR 0012).
import type { CalendarDate, TaskStatus } from "../task/task";
import { addDays } from "../time/calendar-days";

/** A local time of day: hours 0–23, minutes 0–59. */
export interface TimeOfDay {
  readonly hours: number;
  readonly minutes: number;
}

/** The reminder default time until the user sets another one. */
export const defaultReminderTime: TimeOfDay = { hours: 9, minutes: 0 };

/**
 * The reminder default time from the `time` setting's value. Orca holds a
 * whole `Date`; only its local hours and minutes mean anything. Anything but
 * a valid `Date` (or no value) reads as 9:00, as the day boundary reads
 * (plugin-lifecycle-settings).
 */
export function reminderDefaultTimeFrom(value: unknown): TimeOfDay {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return defaultReminderTime;
  }
  return { hours: value.getHours(), minutes: value.getMinutes() };
}

/** Which date a quick option counts back from. */
export type QuickReminderFrom = "due" | "start";

/** The days before each date a quick option can fall. */
const quickDaysBefore: Record<QuickReminderFrom, readonly number[]> = {
  due: [0, 1, 3, 7],
  start: [0, 1],
};

/** A quick option for adding a reminder, worked out to a moment. */
export interface QuickReminderOption {
  readonly from: QuickReminderFrom;
  readonly daysBefore: number;
  readonly at: Date;
  /** Only a moment later than now can be added. */
  readonly selectable: boolean;
}

/** `time` on the calendar day `date`, local time. */
function momentOnDate(date: CalendarDate, time: TimeOfDay): Date {
  return new Date(
    date.year,
    date.month - 1,
    date.day,
    time.hours,
    time.minutes,
  );
}

/**
 * The quick options for a task with these dates: the due day and 1, 3 and 7
 * days before it, then the start day and 1 day before it, each at
 * `defaultTime`. A date the task lacks has no options.
 */
export function quickReminderOptions(
  dates: {
    readonly start: CalendarDate | null;
    readonly due: CalendarDate | null;
  },
  defaultTime: TimeOfDay,
  now: Date,
): QuickReminderOption[] {
  const options: QuickReminderOption[] = [];
  for (const from of ["due", "start"] as const) {
    const date = dates[from];
    if (date === null) continue;
    for (const daysBefore of quickDaysBefore[from]) {
      const at = momentOnDate(addDays(date, -daysBefore), defaultTime);
      options.push({
        from,
        daysBefore,
        at,
        selectable: at.getTime() > now.getTime(),
      });
    }
  }
  return options;
}

/** A task's reminders: moments, ascending, each once. */
export type Reminders = readonly Date[];

/** What setting a task's reminders comes to. */
export type SetRemindersPlan =
  | { readonly kind: "write"; readonly reminders: Reminders }
  /** Newly added moments not later than now; nothing is to be written. */
  | { readonly kind: "refused"; readonly past: Reminders };

/**
 * The reminders to write when the user sets `next` over `current` at `now`.
 * A moment newly added (not among `current`) must be later than now; one the
 * task already had may stay though it has passed. Empty clears them all.
 */
export function planSetReminders(
  current: Reminders,
  next: Reminders,
  now: Date,
): SetRemindersPlan {
  const had = new Set(current.map((moment) => moment.getTime()));
  const past = next.filter(
    (moment) => !had.has(moment.getTime()) && moment.getTime() <= now.getTime(),
  );
  if (past.length > 0) return { kind: "refused", past };
  return { kind: "write", reminders: normalizeReminders(next) };
}

/**
 * What a task's reminders read as. `none`: nothing stored. `unreadable`:
 * something is stored that this plugin cannot read (an unknown version, a
 * damaged value); it is kept as it is and cannot be written.
 */
export type ReminderRead =
  | { readonly kind: "none" }
  | { readonly kind: "list"; readonly reminders: Reminders }
  | { readonly kind: "unreadable"; readonly reason: string };

/** What a task reads as without reminders. */
export const noReminders: ReminderRead = { kind: "none" };

/** The reminders of a read, none for one this plugin cannot read. */
export function remindersIn(read: ReminderRead): Reminders {
  return read.kind === "list" ? read.reminders : [];
}

/**
 * Whether a task card shows the bell: the task is not done and has a
 * reminder still to come.
 */
export function showsReminderBell(
  task: { readonly status: TaskStatus; readonly reminders: ReminderRead },
  now: Date,
): boolean {
  return (
    task.status !== "done" &&
    upcomingReminders(remindersIn(task.reminders), now).length > 0
  );
}

/** The reminders later than `now` (still to come), in order. */
export function upcomingReminders(reminders: Reminders, now: Date): Reminders {
  return reminders.filter((moment) => moment.getTime() > now.getTime());
}

/** `moments` ascending, each moment once. */
export function normalizeReminders(moments: readonly Date[]): Reminders {
  const times = [...new Set(moments.map((moment) => moment.getTime()))];
  return times.sort((a, b) => a - b).map((time) => new Date(time));
}
