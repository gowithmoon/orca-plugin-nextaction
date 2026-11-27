// What the My Day use cases that change a card start from: a task's entries
// as today's My Day reads them, with the entry its standing schedule brings
// in today (GLOSSARY: 常设排期; ADR 0029), computed as reading today's My
// Day does and not written until changed.
import { lastCompletion, lastSkip } from "../../domain/task/completion-history";
import { entryOn, type MyDayEntries } from "../../domain/task/my-day";
import {
  bringingIn,
  standingScheduleOn,
} from "../../domain/task/standing-schedule";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import type { LogicalDayRange } from "../../domain/time/logical-day";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Task `id`'s My Day `entries`, with an entry for `today` (whose range is
 * `range`) at the standing schedule when that brings it in, unscheduled
 * when that crosses the day boundary; `entries` as they are otherwise. A
 * completion history that cannot be read counts as none, as when reading
 * today's My Day.
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
  const read = await repository.readCompletionHistory(id);
  const history = read.kind === "readable" ? read.history : [];
  const completion = lastCompletion(history);
  const skip = lastSkip(history);
  const standing = bringingIn(
    {
      task,
      entries,
      ...(completion && { lastCompletion: completion }),
      ...(skip && { lastSkip: skip }),
    },
    today,
  );
  if (!standing) return entries;
  const schedule = standingScheduleOn(standing, range);
  return [...entries, { day: today, ...(schedule && { schedule }) }];
}
