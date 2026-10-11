// Use case: skip this occurrence of a recurring task (GLOSSARY: 跳过, #91),
// from the task menu: a skip is recorded and the task advances as on a
// completion.
import {
  type NotSkippableReason,
  planSkip,
  skippable,
} from "../../domain/recurrence/recurrence";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import { advanceWrites, eventNow } from "./advance-writes";
import { CompletionHistoryUnreadableError } from "./completion-history-unreadable-error";
import { RecurrenceUnreadableError } from "./recurrence-unreadable-error";

export type { NotSkippableReason };

/** What skipping did: the task's dates are on `next`. */
export interface SkipOccurrenceResult {
  readonly next: CalendarDate;
  /** The logical day of the skip, for showing `next` beside it. */
  readonly skippedOn: CalendarDate;
}

/**
 * The task cannot be skipped (`skippable`); the notes may have changed since
 * the menu was shown. Nothing was written.
 */
export class NotSkippableError extends Error {
  override name = "NotSkippableError";
  constructor(readonly reason: NotSkippableReason) {
    super(`the task cannot be skipped (${reason})`);
  }
}

/**
 * Whether the task menu offers "Skip this occurrence" for `task`, as it was
 * read for the menu: a recurring task whose rule is not paused, not done,
 * and not on its last occurrence today. Writes nothing.
 */
export type CanSkipOccurrence = (task: Task) => boolean;

export function createCanSkipOccurrence(deps: {
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): CanSkipOccurrence {
  return (task) =>
    skippable(task, logicalDay(deps.clock.now(), deps.dayBoundary.current()))
      .kind === "skippable";
}

/**
 * Skips task `id`'s occurrence in one undo: a skip recorded, back to todo,
 * its dates on the next occurrence. Errors are thrown as they are, for `ui`
 * to report.
 */
export type SkipOccurrence = (id: TaskId) => Promise<SkipOccurrenceResult>;

export function createSkipOccurrence(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): SkipOccurrence {
  return async (id) => {
    const task = await deps.repository.getTask(id);
    if (!task) throw new NotSkippableError("not-recurring");
    if (task.recurrence.kind === "unreadable") {
      throw new RecurrenceUnreadableError(task.recurrence.reason);
    }
    const skip = eventNow(deps);
    const checked = skippable(task, skip.day);
    if (checked.kind === "refused") throw new NotSkippableError(checked.reason);
    const read = await deps.repository.readCompletionHistory(id);
    if (read.kind === "unreadable") {
      throw new CompletionHistoryUnreadableError(id, read.reason);
    }
    const plan = planSkip(checked.rule, task, read.history, skip);
    // Not the last occurrence, so the plan advances.
    if (plan.next === null) throw new NotSkippableError("last");
    // The skip, the task's status and dates, the rule (one occurrence used
    // up, #89) and its done descendant tasks (#90) in one write, so one undo.
    await deps.repository.updateTasks(
      await advanceWrites(deps.repository, task, plan),
    );
    return { next: plan.next, skippedOn: skip.day };
  };
}
