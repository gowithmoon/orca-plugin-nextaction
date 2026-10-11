// Shared by the use cases that advance a recurring task (GLOSSARY: 安排下一次):
// completing, skipping, resuming and the repair of a task not advanced.
import { planDescendantAdvances } from "../../domain/recurrence/descendants-advance";
import type { AdvancePlan } from "../../domain/recurrence/recurrence";
import type { CompletionEntry } from "../../domain/task/completion-history";
import type { Task } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository, TaskWrite } from "../ports/task-repository";
import { RecurrenceUnreadableError } from "./recurrence-unreadable-error";

/** The event happening now: its time, and its logical day. */
export function eventNow(deps: {
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): CompletionEntry {
  const at = deps.clock.now();
  return { at, day: logicalDay(at, deps.dayBoundary.current()) };
}

/**
 * An advance of `task` as the domain plans it; `history` absent when nothing
 * is recorded (GLOSSARY: 未自动重复, 暂停重复).
 */
export type PlannedAdvance = Omit<AdvancePlan, "history"> & {
  readonly history?: AdvancePlan["history"];
};

/**
 * The writes for `task` advancing as `plan` says, for one `updateTasks`, so
 * one undo: the task first, then its done descendant tasks without a rule
 * of their own back to todo, their dates moved with it (GLOSSARY:
 * 安排下一次). On the last occurrence the task does not advance, so its
 * descendants are left as they are. Throws `RecurrenceUnreadableError`,
 * having written nothing, when a done descendant task's rule cannot be read.
 */
export async function advanceWrites(
  repository: TaskRepository,
  task: Task,
  plan: PlannedAdvance,
): Promise<TaskWrite[]> {
  const write: TaskWrite = {
    id: task.id,
    changes: plan.changes,
    ...(plan.history !== undefined && { completionHistory: plan.history }),
    ...(plan.recurrence !== undefined && { recurrence: plan.recurrence }),
  };
  if (plan.next === null) return [write];
  const graph = await repository.readTaskGraph();
  const descendants = planDescendantAdvances(task, plan.next, graph.tasks);
  if (descendants.kind === "unreadable") {
    throw new RecurrenceUnreadableError(
      `descendant task ${descendants.id}: ${descendants.reason}`,
    );
  }
  return [write, ...descendants.advances];
}
