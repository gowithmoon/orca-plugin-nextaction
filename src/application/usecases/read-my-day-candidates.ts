// Use case: the tasks the My Day view offers to add (#83, GLOSSARY: 我的一天):
// every task not in today's My Day, done ones included (not ones whose
// entries cannot be read: they cannot be added), with its text for
// searching. The text is matched in `ui`, as for the dependency candidates.
import { todayEntry } from "../../domain/task/my-day";
import type { TaskId } from "../../domain/task/task";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";

/** A task that can be added to today's My Day. */
export interface MyDayCandidate {
  readonly id: TaskId;
  /** As the notes hold it; may be empty. */
  readonly text: string;
}

/**
 * The My Day candidates, in no particular order, from one read. Errors are
 * thrown as they are.
 */
export type ReadMyDayCandidates = () => Promise<MyDayCandidate[]>;

export function createReadMyDayCandidates(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): ReadMyDayCandidates {
  return async () => {
    const now = deps.clock.now();
    const boundary = deps.dayBoundary.current();
    const snapshot = await deps.repository.readTaskGraph();
    return snapshot.tasks
      .filter((item) => {
        // Entries that cannot be read cannot be added to (Spec #81 story 5:
        // every result can be added); none at all read as no entries.
        if (!item.myDay) return true;
        if (item.myDay.kind !== "readable") return false;
        return todayEntry(item.myDay.entries, now, boundary) === undefined;
      })
      .map((item) => ({ id: item.task.id, text: item.task.text }));
  };
}
