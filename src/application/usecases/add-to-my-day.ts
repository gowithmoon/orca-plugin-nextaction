// Use case: add a task to today's My Day (GLOSSARY: 我的一天), unscheduled.
// Any task can be added, done ones and ones that are not next actions too.
// One removed today that its standing schedule (GLOSSARY: 常设排期) brings
// in goes back to its standing schedule instead (ADR 0029, #245).
import { addToday, entryOn, type MyDayEntries } from "../../domain/task/my-day";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import { compareDays } from "../../domain/time/calendar-days";
import { logicalDay, logicalDayRange } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository, TaskWrite } from "../ports/task-repository";
import {
  entriesWithStandingSchedule,
  standingBringingIn,
} from "./entries-with-standing-schedule";
import { MyDayUnreadableError } from "./my-day-unreadable-error";

/** What changing a task's My Day did. */
export type MyDayChangeResult =
  | { kind: "changed" }
  /** It already stood so; nothing was written. */
  | { kind: "unchanged" };

/**
 * Adds task `id` to My Day on the current logical day in one undo, its past
 * entries kept (ADR 0020). One removed from it today has the removal
 * cleared from its standing schedule, writing no entry, so it is brought in
 * at its standing schedule again; one its standing schedule brings in is
 * in already. Throws `MyDayUnreadableError`, writing nothing, when its
 * entries cannot be read; other errors are thrown as they are, for `ui` to
 * report.
 */
export type AddToMyDay = (id: TaskId) => Promise<MyDayChangeResult>;

export function createAddToMyDay(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): AddToMyDay {
  return async (id) => {
    const read = await deps.repository.readMyDay(id);
    if (read.kind === "unreadable") {
      throw new MyDayUnreadableError(id, read.reason);
    }
    const boundary = deps.dayBoundary.current();
    const today = logicalDay(deps.clock.now(), boundary);
    const current = await entriesWithStandingSchedule(
      deps.repository,
      id,
      read.entries,
      today,
      logicalDayRange(today, boundary),
    );
    if (entryOn(current, today)) return { kind: "unchanged" };
    await deps.repository.updateTask(
      id,
      await addingBack(deps.repository, id, read.entries, today),
    );
    return { kind: "changed" };
  };
}

/**
 * What adds task `id`, not in today's My Day with `entries`, to it `today`:
 * a removal today cleared from its standing schedule, and an unscheduled
 * entry unless that alone brings it back (it does not when, say, its date
 * moved past today since); an entry alone otherwise.
 */
async function addingBack(
  repository: TaskRepository,
  id: TaskId,
  entries: MyDayEntries,
  today: CalendarDate,
): Promise<Omit<TaskWrite, "id">> {
  const entry = { myDay: addToday(entries, today) };
  const task = await repository.getTask(id);
  if (task?.standingSchedule.kind !== "schedule") return entry;
  const { removedOn, ...schedule } = task.standingSchedule.schedule;
  if (!removedOn || compareDays(removedOn, today) !== 0) return entry;
  const cleared: Task = {
    ...task,
    standingSchedule: { kind: "schedule", schedule },
  };
  const back = await standingBringingIn(repository, cleared, entries, today);
  return { standingSchedule: schedule, ...(back ? {} : entry) };
}
