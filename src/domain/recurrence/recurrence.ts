// Recurring tasks (GLOSSARY: 重复任务, 重复规则, 重复基准, 下一次发生, 进入下一次;
// ADR 0006). Pure: the event's time and logical day are passed in; whole-day
// arithmetic comes from `domain/time`.
import {
  type CompletionEntry,
  type CompletionHistory,
  lastCompletion,
} from "../task/completion-history";
import type { CalendarDate, TaskStatus } from "../task/task";
import type { TaskChanges } from "../task/task-changes";
import {
  addDays,
  compareDays,
  dayOfWeek,
  daysBetween,
  daysInMonth,
} from "../time/calendar-days";

/**
 * The unit a period counts in. `weekday` (GLOSSARY: 工作日) counts Monday to
 * Friday only, holidays not known.
 */
export const recurrenceUnits = [
  "day",
  "week",
  "month",
  "year",
  "weekday",
] as const;
export type RecurrenceUnit = (typeof recurrenceUnits)[number];

/** A day of the week, Monday (1) to Sunday (7), as ISO 8601 numbers them. */
export const daysOfWeek = [1, 2, 3, 4, 5, 6, 7] as const;
export type DayOfWeek = (typeof daysOfWeek)[number];

/** Which of a month's days of the week: the first to the fifth, or the last. */
export const weekdayOrdinals = [1, 2, 3, 4, 5, "last"] as const;
export type WeekdayOrdinal = (typeof weekdayOrdinals)[number];

/** Where in a week a weekly period falls: some days of the week, at least one. */
export interface WeekPlacement {
  readonly kind: "daysOfWeek";
  /** Ascending, without repeats, at least one. */
  readonly days: readonly DayOfWeek[];
}

/**
 * Where in a month a monthly period falls: a day of the month (1–31), the
 * last day of the month, or the first to fifth or last given day of the week
 * ("每月第二个周二", "每月最后一个周五").
 */
export type MonthPlacement =
  | { readonly kind: "dayOfMonth"; readonly day: number }
  | { readonly kind: "lastDayOfMonth" }
  | {
      readonly kind: "weekdayOfMonth";
      readonly ordinal: WeekdayOrdinal;
      readonly weekday: DayOfWeek;
    };

/** Where in a year a yearly period falls: a month (1–12) and a day of it. */
export interface YearPlacement {
  readonly kind: "dayOfYear";
  readonly month: number;
  readonly day: number;
}

export type RecurrencePlacement =
  | WeekPlacement
  | MonthPlacement
  | YearPlacement;

/**
 * How often a recurring task happens: every `interval` units, on the
 * placement chosen for the unit (#88). Without a placement, it falls on the
 * day matching the day it counts from. Days and weekdays have no placement.
 */
export type RecurrencePeriod =
  | {
      /** A whole number from 1 up. */
      readonly interval: number;
      readonly unit: "day" | "weekday";
    }
  | {
      readonly interval: number;
      readonly unit: "week";
      readonly placement?: WeekPlacement;
    }
  | {
      readonly interval: number;
      readonly unit: "month";
      readonly placement?: MonthPlacement;
    }
  | {
      readonly interval: number;
      readonly unit: "year";
      readonly placement?: YearPlacement;
    };

/**
 * Where the next occurrence counts from (GLOSSARY: 重复基准): the task's
 * current dates ("schedule", 按日程) or the logical day it was completed
 * ("completion", 按完成).
 */
export const recurrenceBases = ["schedule", "completion"] as const;
export type RecurrenceBasis = (typeof recurrenceBases)[number];

/**
 * A recurrence rule (GLOSSARY: 重复规则), with its pause flag (#92). End
 * conditions are added by a later ticket of step 8 (#89).
 */
export interface RecurrenceRule {
  readonly period: RecurrencePeriod;
  readonly basis: RecurrenceBasis;
  /** Without one, the task recurs until the rule is removed. */
  readonly end?: RecurrenceEnd;
  /**
   * Paused (GLOSSARY: 暂停重复, #92): the rule is kept but does not apply,
   * so the task is a plain task. Absent reads as not paused.
   */
  readonly paused?: boolean;
}

/**
 * When a recurring task stops recurring (GLOSSARY: 重复规则, 结束条件): after
 * a logical day (`until`: an occurrence on that day still happens), or after
 * a number of occurrences (`count`: `total` set by the user, `remaining`
 * counting this occurrence, so 1 means this is the last; completing and
 * skipping both use one up). Both are whole numbers from 1 up, `remaining`
 * no more than `total`.
 */
export type RecurrenceEnd =
  | { readonly kind: "until"; readonly day: CalendarDate }
  | {
      readonly kind: "count";
      readonly total: number;
      readonly remaining: number;
    };

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

/**
 * Whether the task recurs (GLOSSARY: 重复任务): it holds a rule this plugin
 * reads. Such a task never stays done, so a dependency on it, or a sequential
 * sibling after it, stays unmet until the rule ends (ADR 0021).
 */
export function recurs(recurrence: RecurrenceRead): boolean {
  return activeRule(recurrence) !== undefined;
}

/**
 * The rule that applies to the task: one it reads and that is not paused
 * (GLOSSARY: 暂停重复, #92). A paused rule is kept, but the task is a plain
 * task until it is resumed.
 */
export function activeRule(
  recurrence: RecurrenceRead,
): RecurrenceRule | undefined {
  return recurrence.kind === "rule" && !recurrence.rule.paused
    ? recurrence.rule
    : undefined;
}

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

/**
 * What advancing a recurring task writes, in one undo. `last`: this was the
 * last occurrence (the next one would fall outside the end condition), so
 * the task stays done and the rule is removed (GLOSSARY: 重复规则).
 */
export interface AdvancePlan {
  readonly last: boolean;
  /**
   * The task's properties: back to todo with its dates moved, or done on
   * the last occurrence.
   */
  readonly changes: TaskChanges;
  /** The completion history with the completion appended. */
  readonly history: CompletionHistory;
  /**
   * The day the task now falls on (GLOSSARY: 下一次发生); `null` on the last
   * occurrence.
   */
  readonly next: CalendarDate | null;
  /**
   * The rule to write with it, present only when it changes: one of the
   * remaining occurrences used up, or `null` (removed) on the last.
   */
  readonly recurrence?: RecurrenceRule | null;
}

/**
 * The end condition "`total` times" as the rule popup saves it: all `total`
 * remaining, except that saving the same total the rule already has keeps
 * the occurrences used up so far (editing another field of the rule does
 * not start the count over).
 */
export function countEnd(
  total: number,
  current: RecurrenceEnd | undefined,
): RecurrenceEnd {
  if (current?.kind === "count" && current.total === total) return current;
  return { kind: "count", total, remaining: total };
}

/**
 * Whether the end condition stops the recurrence before `next` (GLOSSARY:
 * 重复规则): `next` is after the end day, or this occurrence was the one
 * remaining.
 */
function endsBefore(end: RecurrenceEnd | undefined, next: CalendarDate) {
  if (end === undefined) return false;
  return end.kind === "until"
    ? compareDays(next, end.day) > 0
    : end.remaining <= 1;
}

/**
 * Whether this occurrence is the last (GLOSSARY: 重复规则): completing or
 * skipping it on `eventDay` (its logical day) would bring the next occurrence
 * outside the end condition. The task menu offers no skip on the last one
 * (#91).
 */
export function isLastOccurrence(
  rule: RecurrenceRule,
  dates: TaskDates,
  eventDay: CalendarDate,
): boolean {
  return endsBefore(
    rule.end,
    nextOccurrence(rule.period, countsFrom(rule, dates, eventDay)),
  );
}

/** The rule once this occurrence is over: one of the remaining used up. */
function afterOccurrence(rule: RecurrenceRule): RecurrenceRule | undefined {
  if (rule.end?.kind !== "count") return undefined;
  return { ...rule, end: { ...rule.end, remaining: rule.end.remaining - 1 } };
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
  if (endsBefore(rule.end, next)) {
    return {
      last: true,
      changes: { status: "done" },
      history: [...history, completion],
      next: null,
      recurrence: null,
    };
  }
  const recurrence = afterOccurrence(rule);
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
  return {
    last: false,
    changes,
    history: [...history, completion],
    next,
    ...(recurrence && { recurrence }),
  };
}

/**
 * Skipping this occurrence of a recurring task (GLOSSARY: 跳过, #91), at
 * `skip`: a skip is recorded, and the task advances as on a completion (back
 * to todo, its dates moved, one of the remaining occurrences used up); after
 * completion it counts from the logical day of the skip. The last occurrence
 * cannot be skipped (`isLastOccurrence`): the caller refuses it first.
 */
export function planSkip(
  rule: RecurrenceRule,
  task: AdvancingTask,
  history: CompletionHistory,
  skip: Omit<CompletionEntry, "kind">,
): AdvancePlan {
  return planAdvance(rule, task, history, { ...skip, kind: "skip" });
}

/** What repairing a task stuck in done writes, in one undo. */
export type RepairPlan = Omit<AdvancePlan, "history">;

/**
 * Advancing a recurring task stuck in done (GLOSSARY: 进入下一次), on the
 * user's request at `repair`. No completion is recorded: when it was
 * completed in Orca is unknown, so after completion it counts from the
 * logical day of the repair; on a fixed schedule from its current dates, as
 * any advance does.
 */
export function planRepair(
  rule: RecurrenceRule,
  task: AdvancingTask,
  repair: CompletionEntry,
): RepairPlan {
  // The same advance, its completion left out; it uses up an occurrence as
  // any advance does (#89).
  const { history: _, ...plan } = planAdvance(rule, task, [], repair);
  return plan;
}

/** What resuming a done recurring task writes, in one undo. */
export type ResumePlan = Omit<AdvancePlan, "history">;

/**
 * Advancing a done task as its paused rule is resumed (GLOSSARY: 暂停重复,
 * 进入下一次), at `resume`. No completion is recorded: the task was completed
 * while paused, and that completion is in the history already. After
 * completion it counts from the logical day of the last completion
 * recorded (a skip is no completion, #91), or of the resume without one; on a fixed schedule from the
 * task's current dates, as any advance does.
 */
export function planResume(
  rule: RecurrenceRule,
  task: AdvancingTask,
  history: CompletionHistory,
  resume: CompletionEntry,
): ResumePlan {
  // After completion it counts from the last completion, skips passed over
  // (#91); on a fixed schedule
  // from the task's dates, or without dates from the day it is resumed.
  const from =
    rule.basis === "completion" ? (lastCompletion(history) ?? resume) : resume;
  // The same advance, its completion left out; it uses up an occurrence, or
  // ends the recurrence on the last, as any advance does (#89).
  const { history: _, ...plan } = planAdvance(rule, task, [], from);
  return plan;
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
    case "weekday": {
      // Count `interval` Mondays to Fridays after `from`; holidays are not
      // known (GLOSSARY: 工作日).
      let date = from;
      for (let left = period.interval; left > 0; ) {
        date = addDays(date, 1);
        if (dayOfWeek(date) <= 5) left -= 1;
      }
      return date;
    }
    case "week": {
      const days = period.placement?.days ?? [dayOfWeek(from)];
      // The Monday of the week `from` falls in.
      const monday = addDays(from, 1 - dayOfWeek(from));
      return firstAfter(from, (step) =>
        days.map((d) => addDays(monday, 7 * step * period.interval + d - 1)),
      );
    }
    case "month": {
      const placement: MonthPlacement = period.placement ?? {
        kind: "dayOfMonth",
        day: from.day,
      };
      return firstAfter(from, (step) => {
        const months = from.month - 1 + step * period.interval;
        const year = from.year + Math.floor(months / 12);
        const month = (months % 12) + 1;
        return dayInMonth(year, month, placement);
      });
    }
    case "year": {
      const { month, day } = period.placement ?? from;
      return firstAfter(from, (step) => {
        const year = from.year + step * period.interval;
        return day <= daysInMonth(year, month) ? [{ year, month, day }] : [];
      });
    }
  }
}

/**
 * The first day strictly after `from` among the days `inPeriod(0)`,
 * `inPeriod(1)`, … lay out: period 0 is the week, month or year `from` falls
 * in, each next one `interval` units later. Days a period does not have
 * (February 30, a fifth Friday in a month with four) are left out by
 * `inPeriod`, so that period is skipped (GLOSSARY: 重复规则).
 */
function firstAfter(
  from: CalendarDate,
  inPeriod: (step: number) => readonly CalendarDate[],
): CalendarDate {
  // A day that exists once comes back within 400 years (the Gregorian
  // cycle); the bound only guards against a loop without end.
  for (let step = 0; step <= 400 * 53; step += 1) {
    const [first] = inPeriod(step)
      .filter((date) => compareDays(date, from) > 0)
      .sort(compareDays);
    if (first) return first;
  }
  throw new Error("no next occurrence within 400 years");
}

/** The placement's day in a month, or none when the month does not have it. */
function dayInMonth(
  year: number,
  month: number,
  placement: MonthPlacement,
): CalendarDate[] {
  switch (placement.kind) {
    case "dayOfMonth":
      return placement.day <= daysInMonth(year, month)
        ? [{ year, month, day: placement.day }]
        : [];
    case "lastDayOfMonth":
      return [{ year, month, day: daysInMonth(year, month) }];
    case "weekdayOfMonth": {
      const length = daysInMonth(year, month);
      // The month's first day of that weekday, then every 7 days on.
      const first =
        1 + ((placement.weekday - dayOfWeek({ year, month, day: 1 }) + 7) % 7);
      const count = Math.floor((length - first) / 7) + 1;
      const nth = placement.ordinal === "last" ? count : placement.ordinal;
      return nth <= count ? [{ year, month, day: first + 7 * (nth - 1) }] : [];
    }
  }
}

/**
 * A recurring task stuck in done (GLOSSARY: 进入下一次): it holds a rule and
 * is done, so it was completed outside the plugin (in Orca's own interface)
 * and did not advance. A rule that cannot be read does not count: whether it
 * would have advanced is unknown.
 */
export function isStuckDone(task: {
  readonly status: TaskStatus;
  readonly recurrence: RecurrenceRead;
}): boolean {
  // A paused rule does not apply (#92): the task is done like a plain task.
  return task.status === "done" && recurs(task.recurrence);
}
