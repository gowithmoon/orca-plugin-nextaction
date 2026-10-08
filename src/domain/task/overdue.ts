// Overdue (GLOSSARY: 截止日期): a task still not done once its due day has
// ended. Pure; `today` is the current logical day, computed by the caller.
import type { CalendarDate, Task } from "./task";

/** Negative when `a` is before `b`, zero on the same day. */
function compareDays(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function isOverdue(
  task: Pick<Task, "status" | "due">,
  today: CalendarDate,
): boolean {
  return (
    task.status !== "done" &&
    task.due !== null &&
    compareDays(task.due, today) < 0
  );
}
