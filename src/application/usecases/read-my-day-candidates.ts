// Use case: the tasks the My Day view offers to add (#83, GLOSSARY: 我的一天):
// every task not in today's My Day (not by an entry, nor brought in by its
// standing schedule, GLOSSARY: 常设排期), done ones included (not ones whose
// entries cannot be read: they cannot be added), with its text and search
// text for searching. They are matched in `ui` with `matchesSearch` (#112),
// as for the dependency candidates.
import { entryOn } from "../../domain/task/my-day";
import { bringingIn } from "../../domain/task/standing-schedule";
import type { TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";

/** A task that can be added to today's My Day. */
export interface MyDayCandidate {
  readonly id: TaskId;
  /** As the notes hold it; may be empty. */
  readonly text: string;
  /** The task's search text (`Task.searchText`), for `matchesSearch`. */
  readonly searchText: string;
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
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const snapshot = await deps.repository.readTaskGraph();
    return snapshot.tasks
      .filter((item) => {
        // Entries that cannot be read cannot be added to (Spec #81 story 5:
        // every result can be added); none at all read as no entries.
        if (item.myDay?.kind === "unreadable") return false;
        const entries = item.myDay?.entries ?? [];
        // One its standing schedule brings in is in today already (ADR
        // 0029).
        return (
          entryOn(entries, today) === undefined &&
          bringingIn({ ...item, entries }, today) === undefined
        );
      })
      .map((item) => ({
        id: item.task.id,
        text: item.task.text,
        searchText: item.task.searchText,
      }));
  };
}
