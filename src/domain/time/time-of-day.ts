// Times of day and calendar days as local time (ADR 0012). Pure.
import type { CalendarDate } from "./calendar-days";

/** A local time of day: hours 0–23, minutes 0–59. */
export interface TimeOfDay {
  readonly hours: number;
  readonly minutes: number;
}

/** The calendar day `moment` falls on, local time. */
export function calendarDateOf(moment: Date): CalendarDate {
  return {
    year: moment.getFullYear(),
    month: moment.getMonth() + 1,
    day: moment.getDate(),
  };
}

/** `time` on the calendar day `date`, local time. */
export function momentOnDate(date: CalendarDate, time: TimeOfDay): Date {
  return new Date(
    date.year,
    date.month - 1,
    date.day,
    time.hours,
    time.minutes,
  );
}

/** The local time of day `moment` falls at, to the minute. */
export function timeOfDayOf(moment: Date): TimeOfDay {
  return { hours: moment.getHours(), minutes: moment.getMinutes() };
}

/** Whether `a` and `b` are the same time of day. */
export function sameTimeOfDay(a: TimeOfDay, b: TimeOfDay): boolean {
  return a.hours === b.hours && a.minutes === b.minutes;
}
