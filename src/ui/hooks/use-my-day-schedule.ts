// Scheduling and unscheduling in today's My Day (GLOSSARY: 排期, #84), for
// the schedule popup (and dragging on the timeline, #85). Each call is one
// write and one undo. A failure is told to the user; success says nothing,
// the card moving is the answer. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { ScheduleInMyDay } from "../../application/usecases/schedule-in-my-day";
import type { UnscheduleInMyDay } from "../../application/usecases/unschedule-in-my-day";
import type { ScheduleRequest } from "../../domain/task/my-day";
import type { TaskId } from "../../domain/task/task";
import { type Notify, notifyMyDayFailure } from "../notify";

export interface MyDayScheduleDeps {
  scheduleInMyDay: ScheduleInMyDay;
  unscheduleInMyDay: UnscheduleInMyDay;
  notify: Notify;
}

export interface MyDayScheduleActions {
  /**
   * Schedules task `id` at `request`, snapped by the domain. Resolves to
   * whether it succeeded (nothing to write counts as success); never throws.
   */
  schedule(id: TaskId, request: ScheduleRequest): Promise<boolean>;
  /** Unschedules task `id`, keeping it in My Day. Likewise. */
  unschedule(id: TaskId): Promise<boolean>;
}

/** The writes, reporting their failures. */
export function myDayScheduleActions(
  deps: MyDayScheduleDeps,
): MyDayScheduleActions {
  const reporting = async (write: () => Promise<unknown>) => {
    try {
      await write();
      return true;
    } catch (error) {
      notifyMyDayFailure(deps.notify, error);
      return false;
    }
  };
  return {
    schedule: (id, request) =>
      reporting(() => deps.scheduleInMyDay(id, request)),
    unschedule: (id) => reporting(() => deps.unscheduleInMyDay(id)),
  };
}
