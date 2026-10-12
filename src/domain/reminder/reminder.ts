// Reminders (GLOSSARY: 提醒). Pure: the current time is passed in as `now`.
// A reminder is an absolute moment; quick options turn a due or start date
// into one on the calendar day (not the logical day), local time (ADR 0012).
import type { CalendarDate, TaskId, TaskStatus } from "../task/task";
import { addDays, daysBetween } from "../time/calendar-days";
import {
  calendarDateOf,
  momentOnDate,
  type TimeOfDay,
} from "../time/time-of-day";

/** The reminder default time until the user sets another one. */
export const defaultReminderTime: TimeOfDay = { hours: 9, minutes: 0 };

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

/** What checking reminders needs of a task. */
export interface RemindedTask {
  readonly id: TaskId;
  readonly status: TaskStatus;
  readonly reminders: ReminderRead;
}

/** A reminder that has come due: its task and its moment. */
export interface DueReminder {
  readonly taskId: TaskId;
  readonly at: Date;
}

/**
 * Every reminder of `tasks` that came due after `since` (not at it) up to
 * and at `now`, each once, by moment. Done tasks and reminders this plugin
 * cannot read are skipped. Missed reminders come out one by one as those on
 * time do (GLOSSARY: 错过的提醒).
 */
export function dueReminders(
  tasks: readonly RemindedTask[],
  since: Date,
  now: Date,
): DueReminder[] {
  const due: DueReminder[] = [];
  for (const task of tasks) {
    // A done task is not reminded; reminders it cannot read are none.
    if (task.status === "done") continue;
    for (const moment of remindersIn(task.reminders)) {
      if (
        moment.getTime() > since.getTime() &&
        moment.getTime() <= now.getTime()
      ) {
        due.push({ taskId: task.id, at: moment });
      }
    }
  }
  // Stable: reminders at the same moment keep the order of `tasks`.
  return due.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * When reminders next need checking: the earliest reminder later than `now`
 * among `tasks` not done; `null` when none is to come.
 */
export function nextWakeUp(
  tasks: readonly RemindedTask[],
  now: Date,
): Date | null {
  let earliest: Date | null = null;
  for (const task of tasks) {
    if (task.status === "done") continue;
    const next = upcomingReminders(remindersIn(task.reminders), now)[0];
    if (next && (earliest === null || next.getTime() < earliest.getTime())) {
      earliest = next;
    }
  }
  return earliest;
}

/** `moments` ascending, each moment once. */
export function normalizeReminders(moments: readonly Date[]): Reminders {
  const times = [...new Set(moments.map((moment) => moment.getTime()))];
  return times.sort((a, b) => a - b).map((time) => new Date(time));
}

/** `moment` `days` calendar days later, at the same local time. */
function laterByDays(moment: Date, days: number): Date {
  return new Date(
    moment.getFullYear(),
    moment.getMonth(),
    moment.getDate() + days,
    moment.getHours(),
    moment.getMinutes(),
    moment.getSeconds(),
    moment.getMilliseconds(),
  );
}

/**
 * The reminders after a recurring task advances to `next` (GLOSSARY: 安排下一次,
 * 提醒), from its dates before the advance: each reminder moves as many
 * calendar days as the task's date moves, keeping its local time.
 */
export function moveReminders(
  reminders: Reminders,
  dates: {
    readonly start: CalendarDate | null;
    readonly due: CalendarDate | null;
  },
  next: CalendarDate,
): Reminders {
  const sorted = normalizeReminders(reminders);
  // The due date leads, the start date without one, as planAdvance moves
  // the task's dates.
  const from = dates.due ?? dates.start;
  if (from !== null) {
    const days = daysBetween(from, next);
    return sorted.map((moment) => laterByDays(moment, days));
  }
  // Without dates the earliest reminder goes to the next date at its local
  // time; the others keep their time from it.
  const [earliest] = sorted;
  if (earliest === undefined) return [];
  const moved = laterByDays(
    earliest,
    daysBetween(calendarDateOf(earliest), next),
  );
  const shift = moved.getTime() - earliest.getTime();
  return sorted.map((moment) => new Date(moment.getTime() + shift));
}
