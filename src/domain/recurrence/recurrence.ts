// Recurring tasks (GLOSSARY: 重复任务, 重复规则, 重复基准, 下一次发生, 进入下一次;
// ADR 0006). Pure: the event's time and logical day are passed in; whole-day
// arithmetic comes from `domain/time`.
import type {
  CompletionEntry,
  CompletionHistory,
} from "../task/completion-history";
import type { CalendarDate, TaskStatus } from "../task/task";
import type { TaskChanges } from "../task/task-changes";
import { addDays, daysBetween } from "../time/calendar-days";

/** The unit a period counts in. */
export const recurrenceUnits = ["day", "week", "month", "year"] as const;
export type RecurrenceUnit = (typeof recurrenceUnits)[number];

/**
 * How often a recurring task happens: every `interval` units. Without a
 * placement (this step's only kind), it falls on the day matching the day it
 * counts from.
 */
export interface RecurrencePeriod {
  /** A whole number from 1 up. */
  readonly interval: number;
  readonly unit: RecurrenceUnit;
}

/**
 * Where the next occurrence counts from (GLOSSARY: 重复基准): the task's
 * current dates ("schedule", 按日程) or the logical day it was completed
 * ("completion", 按完成).
 */
export const recurrenceBases = ["schedule", "completion"] as const;
export type RecurrenceBasis = (typeof recurrenceBases)[number];

/**
 * A recurrence rule (GLOSSARY: 重复规则). Placements, end conditions and
 * pausing are added by later tickets of step 8 (#88, #89, #92).
 */
export interface RecurrenceRule {
  readonly period: RecurrencePeriod;
  readonly basis: RecurrenceBasis;
}

/**
 * What a task's recurrence rule reads as. `none`: not a recurring task (no
 * rule stored, or it was removed). `unreadable`: something is stored that
 * this plugin cannot read (an unknown version, a missing field, a value out
 * of range); it is kept as it is and cannot be written, and completing the
 * task fails rather than guess.
 */
export type RecurrenceRead =
  | { readonly kind: "none" }
  | { readonly kind: "rule"; readonly rule: RecurrenceRule }
  | { readonly kind: "unreadable"; readonly reason: string };

/** No rule: what a task reads as without one. */
export const noRecurrence: RecurrenceRead = { kind: "none" };

/** A task's dates, as the next occurrence needs them. */
export interface TaskDates {
  readonly start: CalendarDate | null;
  readonly due: CalendarDate | null;
}

/**
 * The day the next occurrence counts from (GLOSSARY: 重复基准). On a fixed
 * schedule: the due date, else the start date, else `completedOn`; after
 * completion: `completedOn`, the logical day the task was completed.
 */
export function countsFrom(
  rule: RecurrenceRule,
  dates: TaskDates,
  completedOn: CalendarDate,
): CalendarDate {
  if (rule.basis === "completion") return completedOn;
  return dates.due ?? dates.start ?? completedOn;
}

/** What advancing a task needs to know about it. */
export interface AdvancingTask extends TaskDates {
  readonly status: TaskStatus;
}

/** What advancing a recurring task writes, in one undo. */
export interface AdvancePlan {
  /** The task's properties: back to todo, its dates moved. */
  readonly changes: TaskChanges;
  /** The completion history with the completion appended. */
  readonly history: CompletionHistory;
  /** The day the task now falls on (GLOSSARY: 下一次发生). */
  readonly next: CalendarDate;
}

/**
 * Advancing a recurring task once it is completed (GLOSSARY: 进入下一次):
 * the task itself only; its descendant tasks are planned by
 * `planDescendantResets` (descendant-reset.ts).
 */
export function planAdvance(
  rule: RecurrenceRule,
  task: AdvancingTask,
  history: CompletionHistory,
  completion: CompletionEntry,
): AdvancePlan {
  const next = nextOccurrence(
    rule.period,
    countsFrom(rule, task, completion.day),
  );
  const changes: TaskChanges =
    task.due !== null
      ? {
          status: "todo",
          due: next,
          // The start keeps its days before the due date.
          ...(task.start !== null && {
            start: addDays(next, daysBetween(task.due, task.start)),
          }),
        }
      : // Only a start date moves it; without dates the next occurrence is
        // written as the start, so the task shows on that day without
        // becoming overdue.
        { status: "todo", start: next };
  return { changes, history: [...history, completion], next };
}

/**
 * The next occurrence (GLOSSARY: 下一次发生): the first day the period lays
 * out strictly after `from`.
 */
export function nextOccurrence(
  period: RecurrencePeriod,
  from: CalendarDate,
): CalendarDate {
  switch (period.unit) {
    case "day":
      return addDays(from, period.interval);
    case "week":
      return addDays(from, 7 * period.interval);
    case "month":
      return firstExisting((step) => {
        const months = from.month - 1 + step * period.interval;
        return {
          year: from.year + Math.floor(months / 12),
          month: (months % 12) + 1,
          day: from.day,
        };
      });
    case "year":
      return firstExisting((step) => ({
        year: from.year + step * period.interval,
        month: from.month,
        day: from.day,
      }));
  }
}

/**
 * The first day that exists among `candidate(1)`, `candidate(2)`, …: a month
 * or a year without that day is skipped (GLOSSARY: 重复规则), never moved to
 * another day. Every candidate is later than the one before.
 */
function firstExisting(
  candidate: (step: number) => CalendarDate,
): CalendarDate {
  // A day that exists once comes back within 400 years (the Gregorian
  // cycle); the bound only guards against a loop without end.
  for (let step = 1; step <= 400 * 12; step += 1) {
    const date = candidate(step);
    if (exists(date)) return date;
  }
  throw new Error("no next occurrence within 400 years");
}

/** Whether the date is a day of the calendar (not e.g. February 30). */
function exists(date: CalendarDate): boolean {
  return addDays(date, 0).day === date.day;
}
