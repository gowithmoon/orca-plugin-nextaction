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
import type { Task, TaskId } from "../../domain/task/task";
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
  /** Highest score first, done ones after the others. */
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
    for (const item of snapshot.tasks) {
      if (item.myDay?.kind !== "readable") continue;
      const todays = todayEntry(item.myDay.entries, now, boundary);
      if (!todays) continue;
      const entry = graph.entry(item.task.id);
      if (!entry) continue;
      inToday.push(entry);
      // One outside today's range reads as unscheduled (ADR 0020).
      if (todays.schedule && scheduleWithin(todays.schedule, range)) {
        schedules.set(item.task.id, todays.schedule);
      }
    }
    const ranked = rankByScore(inToday, today);
    const ordered = [
      ...ranked.filter((entry) => entry.task.status !== "done"),
      ...ranked.filter((entry) => entry.task.status === "done"),
    ].map((entry, unscheduledOrder) => ({
      task: entry.task,
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
