// Use case: set, change or clear a recurring task's standing schedule
// (GLOSSARY: 常设排期; ADR 0029). Only the standing schedule is written, in
// one undo; My Day entries are left as they are, so a day that has one
// keeps it.
import {
  keepingRemoval,
  type StandingSchedule,
  type StandingScheduleProblem,
  standingScheduleProblem,
} from "../../domain/task/standing-schedule";
import type { Task, TaskId } from "../../domain/task/task";
import type { DayBoundary } from "../../domain/time/logical-day";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";

/**
 * A standing schedule was not saved, nothing written: the task has no
 * recurrence rule (`not-recurring`; only recurring tasks have one), or the
 * times cannot be saved (`StandingScheduleProblem`).
 */
export class StandingScheduleRefusedError extends Error {
  override name = "StandingScheduleRefusedError";

  constructor(readonly reason: "not-recurring" | StandingScheduleProblem) {
    super(`the standing schedule cannot be saved (${reason})`);
  }
}

/**
 * Throws `StandingScheduleRefusedError` when `schedule` cannot be set on
 * `task`: it has no rule this plugin reads (a paused one counts: it is
 * kept, and so is the standing schedule), or the times cannot be saved.
 */
export function checkStandingSchedule(
  task: Pick<Task, "recurrence"> | null,
  schedule: StandingSchedule,
  boundary: DayBoundary,
): void {
  if (task?.recurrence.kind !== "rule") {
    throw new StandingScheduleRefusedError("not-recurring");
  }
  const problem = standingScheduleProblem(schedule, boundary);
  if (problem) throw new StandingScheduleRefusedError(problem);
}

/**
 * Writes `schedule` as task `id`'s standing schedule in one undo; `null`
 * clears it. Throws `StandingScheduleRefusedError` as `checkStandingSchedule`
 * says, writing nothing; other errors are thrown as they are, for `ui` to
 * report (one this plugin cannot read is not overwritten).
 */
export type SetStandingSchedule = (
  id: TaskId,
  schedule: StandingSchedule | null,
) => Promise<void>;

export function createSetStandingSchedule(deps: {
  repository: TaskRepository;
  dayBoundary: DayBoundarySetting;
}): SetStandingSchedule {
  return async (id, schedule) => {
    // Clearing needs no rule: one left behind can always go.
    if (!schedule) {
      await deps.repository.updateTask(id, { standingSchedule: null });
      return;
    }
    const task = await deps.repository.getTask(id);
    checkStandingSchedule(task, schedule, deps.dayBoundary.current());
    await deps.repository.updateTask(id, {
      // A removal from today's My Day stays (#245).
      standingSchedule: task
        ? keepingRemoval(schedule, task.standingSchedule)
        : schedule,
    });
  };
}
