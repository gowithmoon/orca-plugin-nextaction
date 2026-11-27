// Whether one task's standing schedule (GLOSSARY: 常设排期) brings it into
// My Day on a day, for the use cases that change or tell one task's My Day
// (#245); reading today's My Day works it out over the task graph instead.
import { lastCompletion, lastSkip } from "../../domain/task/completion-history";
import type { MyDayEntries } from "../../domain/task/my-day";
import {
  bringingIn,
  type StandingSchedule,
} from "../../domain/task/standing-schedule";
import type { CalendarDate, Task } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/**
 * The standing schedule that brings `task` into My Day on `day` with
 * `entries` as its My Day entries (`bringingIn`), or `undefined`. Its
 * completion history is read only when it has a standing schedule; one that
 * cannot be read tells no completion or skip.
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
  return bringingIn(
    {
      task,
      entries,
      lastCompletion: lastCompletion(history),
      lastSkip: lastSkip(history),
    },
    day,
  );
}
