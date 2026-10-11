// The full review's steps by due date (GLOSSARY: 完整回顾, 截止日期): the
// overdue tasks and the ones due in the next 7 days. Pure; `today` is the
// current logical day, computed by the caller.
import type { CalendarDate, Task } from "../task/task";
import { addDays, dayOfWeek, daysBetween } from "../time/calendar-days";

/** The overdue step's quick due dates: tomorrow, or next Monday. */
export type QuickDueDate = "tomorrow" | "nextMonday";

/**
 * The due date `choice` sets on the logical day `today`. Next Monday is the
 * Monday of the next week: a week on when today is a Monday.
 */
export function quickDueDate(
  choice: QuickDueDate,
  today: CalendarDate,
): CalendarDate {
  if (choice === "tomorrow") return addDays(today, 1);
  return addDays(today, 8 - dayOfWeek(today));
}

/**
 * Whether the task is due in the next 7 days: not done, its due date today
 * or within the 6 logical days after it. An overdue task is not.
 */
export function isDueSoon(
  task: Pick<Task, "status" | "due">,
  today: CalendarDate,
): boolean {
  if (task.status === "done" || task.due === null) return false;
  const days = daysBetween(today, task.due);
  return days >= 0 && days <= 6;
}
