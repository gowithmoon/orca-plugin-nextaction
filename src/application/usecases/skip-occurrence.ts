// Use case: skip this occurrence of a recurring task (GLOSSARY: 跳过, #91),
// from the task menu: a skip is recorded and the task advances as on a
// completion.
import { planDescendantResets } from "../../domain/recurrence/descendant-reset";
import {
  activeRule,
  isLastOccurrence,
  planSkip,
  type RecurrenceRule,
} from "../../domain/recurrence/recurrence";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";
import {
  CompletionHistoryUnreadableError,
  RecurrenceUnreadableError,
} from "./change-status";

/** What skipping did: the task's dates are on `next`. */
export interface SkipOccurrenceResult {
  readonly next: CalendarDate;
  /** The logical day of the skip, for showing `next` beside it. */
  readonly skippedOn: CalendarDate;
}

/**
 * Why the task cannot be skipped (GLOSSARY: 跳过): it is not a recurring task
 * (no rule, or not a task at all), its rule is paused, it is done, or this is
 * its last occurrence (a skipped last occurrence would leave it neither done
 * nor recurring). The notes may have changed since the menu was shown.
 */
export type NotSkippableReason = "not-recurring" | "paused" | "done" | "last";

/** The task cannot be skipped; nothing was written. */
export class NotSkippableError extends Error {
  override name = "NotSkippableError";
  constructor(readonly reason: NotSkippableReason) {
    super(`the task cannot be skipped (${reason})`);
  }
}

/**
 * Whether `task` can be skipped on the logical day `today`, with the rule
 * that applies when it can. A rule this plugin cannot read is refused as not
 * recurring here; skipping reports it as unreadable.
 */
function skippable(
  task: Task,
  today: CalendarDate,
):
  | { readonly kind: "skippable"; readonly rule: RecurrenceRule }
  | { readonly kind: "refused"; readonly reason: NotSkippableReason } {
  if (task.recurrence.kind !== "rule") {
    return { kind: "refused", reason: "not-recurring" };
  }
  const rule = activeRule(task.recurrence);
  if (!rule) return { kind: "refused", reason: "paused" };
  if (task.status === "done") return { kind: "refused", reason: "done" };
  if (isLastOccurrence(rule, task, today)) {
    return { kind: "refused", reason: "last" };
  }
  return { kind: "skippable", rule };
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
    const now = deps.clock.now();
    const skip = { at: now, day: logicalDay(now, deps.dayBoundary.current()) };
    const checked = skippable(task, skip.day);
    if (checked.kind === "refused") throw new NotSkippableError(checked.reason);
    const { rule } = checked;
    const read = await deps.repository.readCompletionHistory(id);
    if (read.kind === "unreadable") {
      throw new CompletionHistoryUnreadableError(
        `the completion history of task ${id} cannot be read (${read.reason})`,
      );
    }
    const plan = planSkip(rule, task, read.history, skip);
    // Not the last occurrence, so the plan advances.
    if (plan.next === null) throw new NotSkippableError("last");
    // Its done descendant tasks go back to todo, as on any advance (#90).
    const graph = await deps.repository.readTaskGraph();
    const descendants = planDescendantResets(task, plan.next, graph.tasks);
    if (descendants.kind === "unreadable") {
      throw new RecurrenceUnreadableError(
        `descendant task ${descendants.id}: ${descendants.reason}`,
      );
    }
    // The skip, the task's status and dates, the rule (one occurrence used
    // up, #89) and its descendant tasks in one write, so one undo.
    await deps.repository.updateTasks([
      {
        id,
        changes: plan.changes,
        completionHistory: plan.history,
        ...(plan.recurrence !== undefined && { recurrence: plan.recurrence }),
      },
      ...descendants.resets,
    ]);
    return { next: plan.next, skippedOn: skip.day };
  };
}
