// Use case: read today's My Day (GLOSSARY: 我的一天), for the My Day view
// (#83): the tasks with an entry on the current logical day.
import {
  analyzeTaskGraph,
  type TaskGraphEntry,
} from "../../domain/blocking/task-graph";
import { rankByScore } from "../../domain/scoring/score";
import {
  type MyDaySchedule,
  scheduleWithin,
  todayEntry,
} from "../../domain/task/my-day";
import { isOverdue } from "../../domain/task/overdue";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import { compareDays } from "../../domain/time/calendar-days";
import {
  type LogicalDayRange,
  logicalDay,
  logicalDayRange,
} from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";

/** A task in today's My Day. */
export interface MyDayItem {
  readonly task: Task;
  /**
   * Done today: the task is done, or it is a recurring task completed today
   * that has advanced already (GLOSSARY: 我的一天), its status todo.
   */
  readonly done: boolean;
  /**
   * Skipped today: a recurring task whose occurrence was skipped today and
   * has advanced (GLOSSARY: 跳过, #91). Faded as done, saying so; a task
   * also completed today reads as done instead.
   */
  readonly skipped: boolean;
  /** Still not done after its due day (GLOSSARY: 截止日期). */
  readonly overdue: boolean;
  /**
   * Its place in the unscheduled area's order among all of today's tasks,
   * scheduled ones too, from 0: where it would go once unscheduled, so a
   * drop on the unscheduled area shows it there at once (#85).
   */
  readonly unscheduledOrder: number;
}

/** A scheduled task in today's My Day. */
export interface ScheduledMyDayItem extends MyDayItem {
  readonly schedule: MyDaySchedule;
}

/** Today's My Day. */
export interface TodaysMyDay {
  /**
   * Today's time range it was read by, from the day boundary to the next
   * one: what the timeline covers (#84).
   */
  readonly range: LogicalDayRange;
  /** By start, earliest first. */
  readonly scheduled: readonly ScheduledMyDayItem[];
  /** Highest score first, done and skipped ones after the others. */
  readonly unscheduled: readonly MyDayItem[];
}

/** Reads today's My Day. Errors are thrown as they are. */
export type ReadMyDay = () => Promise<TodaysMyDay>;

export function createReadMyDay(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}): ReadMyDay {
  return async () => {
    const now = deps.clock.now();
    const boundary = deps.dayBoundary.current();
    const today = logicalDay(now, boundary);
    const range = logicalDayRange(today, boundary);
    const snapshot = await deps.repository.readTaskGraph();
    // The graph gives what the score needs: the effective start and the
    // ancestor tasks' ratings (ADR 0015, 0019).
    const graph = analyzeTaskGraph(snapshot, {
      today,
      previewDays: deps.startPreviewDays.current(),
    });
    const inToday: TaskGraphEntry[] = [];
    const schedules = new Map<TaskId, MyDaySchedule>();
    const done = new Set<TaskId>();
    const skipped = new Set<TaskId>();
    for (const item of snapshot.tasks) {
      if (item.myDay?.kind !== "readable") continue;
      const todays = todayEntry(item.myDay.entries, now, boundary);
      if (!todays) continue;
      const entry = graph.entry(item.task.id);
      if (!entry) continue;
      inToday.push(entry);
      // A recurring task completed today has advanced to todo, but today it
      // counts as done (GLOSSARY: 我的一天).
      // Only completions count (GLOSSARY: 完成历史); one skipped today shows
      // as skipped (#91).
      const recurring = item.task.recurrence.kind === "rule";
      const onToday = (entry: { day: CalendarDate } | undefined) =>
        entry !== undefined && compareDays(entry.day, today) === 0;
      if (
        item.task.status === "done" ||
        (recurring && onToday(item.lastCompletion))
      ) {
        done.add(item.task.id);
      } else if (recurring && onToday(item.lastSkip)) {
        skipped.add(item.task.id);
      }
      // One outside today's range reads as unscheduled (ADR 0020).
      if (todays.schedule && scheduleWithin(todays.schedule, range)) {
        schedules.set(item.task.id, todays.schedule);
      }
    }
    const ranked = rankByScore(inToday, today);
    // Done and skipped ones are over for today: after the others.
    const over = (id: TaskId) => done.has(id) || skipped.has(id);
    const ordered = [
      ...ranked.filter((entry) => !over(entry.task.id)),
      ...ranked.filter((entry) => over(entry.task.id)),
    ].map((entry, unscheduledOrder) => ({
      task: entry.task,
      done: done.has(entry.task.id),
      skipped: skipped.has(entry.task.id),
      overdue: isOverdue(entry.task, today),
      unscheduledOrder,
    }));
    const scheduled: ScheduledMyDayItem[] = [];
    const unscheduled: MyDayItem[] = [];
    for (const item of ordered) {
      const schedule = schedules.get(item.task.id);
      if (schedule) scheduled.push({ ...item, schedule });
      else unscheduled.push(item);
    }
    scheduled.sort(
      (a, b) => a.schedule.start.getTime() - b.schedule.start.getTime(),
    );
    return { range, scheduled, unscheduled };
  };
}
