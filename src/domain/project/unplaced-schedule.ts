// What dragging an unplaced task (GLOSSARY: 待排期任务) onto the gantt
// chart's time axis writes (ROADMAP step 11 phase 5, #181): the day it is
// let go becomes its start date, its due date comes a week on, so its bar
// is a week long, both ends counted. Pure.
import type { CalendarDate } from "../task/task";
import { addDays } from "../time/calendar-days";

/** How many days an unplaced task's bar is, once dropped on the axis. */
const unplacedTaskDays = 7;

/** The dates an unplaced task gets when dropped on `day`. */
export function unplacedTaskDates(day: CalendarDate): {
  readonly start: CalendarDate;
  readonly due: CalendarDate;
} {
  return { start: day, due: addDays(day, unplacedTaskDays - 1) };
}
