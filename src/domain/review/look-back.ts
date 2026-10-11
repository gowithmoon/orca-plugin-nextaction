// Look back (GLOSSARY: 回看过去): what was done, skipped, and planned but not
// done since the last full review. Pure: the current time and logical day
// are passed in.
import type {
  CompletionHistory,
  CompletionKind,
} from "../task/completion-history";
import type { MyDayEntries } from "../task/my-day";
import type { CalendarDate, Task } from "../task/task";
import { addDays, compareDays } from "../time/calendar-days";
import {
  type DayBoundary,
  logicalDay,
  logicalDayRange,
} from "../time/logical-day";

/** How far look back reaches without a last full review, in logical days. */
const fallbackDays = 7;

/**
 * Where look back starts: when the last full review was completed (GLOSSARY:
 * 完整回顾), or, when there is none or it is lost, the start of the logical
 * day 7 days before `today` (its day boundary).
 */
export function lookBackStart(
  lastFullReview: Date | null,
  today: CalendarDate,
  boundary: DayBoundary,
): Date {
  return (
    lastFullReview ??
    logicalDayRange(addDays(today, -fallbackDays), boundary).start
  );
}

/** A task with what look back reads of it. */
export interface LookBackTask<T extends Pick<Task, "id" | "status">> {
  readonly task: T;
  /** Its completion history (GLOSSARY: 完成历史), oldest first. */
  readonly history: CompletionHistory;
  /** Its My Day entries (GLOSSARY: 我的一天记录), every logical day's. */
  readonly myDay: MyDayEntries;
}

/** One completion or skip, with its task. */
export interface LookBackEntry<T> {
  readonly task: T;
  readonly kind: CompletionKind;
  readonly at: Date;
}

export interface LookBack<T> {
  /**
   * Every completion and skip after the start, one each, the latest first:
   * a recurring task once per completion or skip.
   */
  readonly entries: readonly LookBackEntry<T>[];
  /**
   * The tasks planned but not done: with a My Day entry from the start's
   * logical day to yesterday, and still not done since. One each, in the
   * order given.
   */
  readonly plannedNotDone: readonly T[];
}

export interface LookBackOptions {
  /** Where look back starts (`lookBackStart`). */
  readonly start: Date;
  /** The current logical day. */
  readonly today: CalendarDate;
  readonly boundary: DayBoundary;
}

/** What look back lists, from every task's history and My Day entries. */
export function lookBack<T extends Pick<Task, "id" | "status">>(
  tasks: readonly LookBackTask<T>[],
  options: LookBackOptions,
): LookBack<T> {
  const entries: LookBackEntry<T>[] = [];
  for (const { task, history } of tasks) {
    for (const recorded of history) {
      if (recorded.at.getTime() <= options.start.getTime()) continue;
      entries.push({
        task,
        kind: recorded.kind ?? "completion",
        at: recorded.at,
      });
    }
  }
  entries.sort((a, b) => b.at.getTime() - a.at.getTime());
  const firstDay = logicalDay(options.start, options.boundary);
  const plannedNotDone = tasks
    .filter(
      ({ task, history, myDay }) =>
        task.status !== "done" &&
        myDay.some(
          ({ day }) =>
            compareDays(day, firstDay) >= 0 &&
            compareDays(day, options.today) < 0 &&
            // A recurring task completed then has advanced: it was done.
            !history.some(
              (recorded) =>
                (recorded.kind ?? "completion") === "completion" &&
                compareDays(recorded.day, day) >= 0,
            ),
        ),
    )
    .map(({ task }) => task);
  return { entries, plannedNotDone };
}
