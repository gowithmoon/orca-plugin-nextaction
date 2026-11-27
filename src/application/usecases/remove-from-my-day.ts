// Use case: remove a task from today's My Day (GLOSSARY: 我的一天).
import { type MyDayEntries, removeToday } from "../../domain/task/my-day";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository, TaskWrite } from "../ports/task-repository";
import type { MyDayChangeResult } from "./add-to-my-day";
import { MyDayUnreadableError } from "./my-day-unreadable-error";
import { standingBringingIn } from "./standing-bringing-in";

/**
 * Removes task `id` from My Day on the current logical day in one undo:
 * only today's entry goes, past entries are kept (ADR 0020). One its
 * standing schedule (GLOSSARY: 常设排期) would bring in without that entry
 * is marked removed today on it as well, so today it is not brought in
 * (ADR 0029, #245). Throws `MyDayUnreadableError`, writing nothing, when its
 * entries cannot be read; other errors are thrown as they are, for `ui` to
 * report.
 */
export type RemoveFromMyDay = (id: TaskId) => Promise<MyDayChangeResult>;

export function createRemoveFromMyDay(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
}): RemoveFromMyDay {
  return async (id) => {
    const read = await deps.repository.readMyDay(id);
    if (read.kind === "unreadable") {
      throw new MyDayUnreadableError(id, read.reason);
    }
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const entries = removeToday(read.entries, today);
    const write: Omit<TaskWrite, "id"> = {
      ...(entries !== read.entries && { myDay: entries }),
      ...(await standingRemoval(deps.repository, id, entries, today)),
    };
    if (Object.keys(write).length === 0) return { kind: "unchanged" };
    await deps.repository.updateTask(id, write);
    return { kind: "changed" };
  };
}

/**
 * The standing schedule marked removed `today`, when it would bring task
 * `id` in with `entries` (today's gone); nothing otherwise, one already
 * removed today included.
 */
async function standingRemoval(
  repository: TaskRepository,
  id: TaskId,
  entries: MyDayEntries,
  today: CalendarDate,
): Promise<Pick<TaskWrite, "standingSchedule">> {
  const task = await repository.getTask(id);
  const standing =
    task && (await standingBringingIn(repository, task, entries, today));
  return standing
    ? { standingSchedule: { ...standing, removedOn: today } }
    : {};
}
