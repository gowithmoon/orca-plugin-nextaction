// What the My Day use cases that change or tell one task's My Day start from:
// a task's entries as today's My Day reads them, with the entry its standing
// schedule brings in today (GLOSSARY: 常设排期; ADR 0029), computed as
// reading today's My Day does and not written until changed.
import { lastCompletion, lastSkip } from "../../domain/task/completion-history";
import { entryOn, type MyDayEntries } from "../../domain/task/my-day";
import {
  bringingIn,
  type StandingSchedule,
  standingScheduleOn,
} from "../../domain/task/standing-schedule";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import type { LogicalDayRange } from "../../domain/time/logical-day";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Task `id`'s My Day `entries`, with an entry for `today` (whose range is
 * `range`) at the standing schedule when that brings it in, unscheduled
 * when that crosses the day boundary; `entries` as they are otherwise.
 */
export async function entriesWithStandingSchedule(
  repository: TaskRepository,
  id: TaskId,
  entries: MyDayEntries,
  today: CalendarDate,
  range: LogicalDayRange,
): Promise<MyDayEntries> {
  if (entryOn(entries, today)) return entries;
  const task = await repository.getTask(id);
  if (!task) return entries;
  const standing = await standingBringingIn(repository, task, entries, today);
  if (!standing) return entries;
  const schedule = standingScheduleOn(standing, range);
  return [...entries, { day: today, ...(schedule && { schedule }) }];
}

/**
 * The standing schedule that brings `task` into My Day on `day` with
 * `entries` as its My Day entries (`bringingIn`), or `undefined`. Its
 * completion history is read only when it has a standing schedule; one that
 * cannot be read counts as none, as when reading today's My Day.
 */
export async function standingBringingIn(
  repository: TaskRepository,
  task: Task,
  entries: MyDayEntries,
  day: CalendarDate,
): Promise<StandingSchedule | undefined> {
  if (task.standingSchedule.kind !== "schedule") return undefined;
  const read = await repository.readCompletionHistory(task.id);
  const history = read.kind === "readable" ? read.history : [];
  const completion = lastCompletion(history);
  const skip = lastSkip(history);
  return bringingIn(
    {
      task,
      entries,
      ...(completion && { lastCompletion: completion }),
      ...(skip && { lastSkip: skip }),
    },
    day,
  );
}
