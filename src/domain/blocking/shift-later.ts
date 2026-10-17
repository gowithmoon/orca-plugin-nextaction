// Shifting later (GLOSSARY: 顺延, #184): the plan for moving the tasks after
// one task out of their date conflicts, along the dependencies. Only ever
// asked for by the user; the plugin never shifts on its own. Pure; the
// conflicts are judged by date-conflict.ts, so the gantt chart's count and
// the write agree.

import type { CalendarDate, Task, TaskId } from "../task/task";
import { addDays, daysBetween } from "../time/calendar-days";
import {
  type DependencyLookup,
  earliestStart,
  hasDateConflict,
} from "./date-conflict";

/** What is read of a task for shifting. */
export type ShiftTask = Pick<
  Task,
  | "id"
  | "status"
  | "start"
  | "due"
  | "dependencies"
  | "dependencyMode"
  | "dependencyDelay"
>;

/** A task's new dates; `due` stays `null` for one that has none. */
export interface ShiftedDates {
  readonly id: TaskId;
  readonly start: CalendarDate;
  readonly due: CalendarDate | null;
}

/**
 * The tasks shifted after task `from`, each once, in the order shifted
 * (every task before the tasks waiting for it). Empty when none conflicts.
 */
export type ShiftLaterPlan = (from: TaskId) => readonly ShiftedDates[];

/**
 * Plans shifting later among `tasks`; only those `movable` move (the
 * project's tasks not done). From a task, follows the dependencies to the
 * tasks waiting for it: each in conflict moves its start to the earliest its
 * dependencies allow (`earliestStart`), its due date by as many days; then
 * the tasks waiting for it are judged by its new dates, until none
 * conflicts. A task reached along several paths is judged once, after all of
 * them, so it takes the latest date. A cycle in the notes is cut where it
 * closes; the task shifted from never moves.
 */
export function shiftLaterPlanner(
  tasks: readonly ShiftTask[],
  movable: (task: ShiftTask) => boolean,
): ShiftLaterPlan {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  /** The movable tasks waiting for each task, in note order. */
  const waiting = new Map<TaskId, ShiftTask[]>();
  for (const task of tasks) {
    if (!movable(task)) continue;
    for (const id of new Set(task.dependencies)) {
      const list = waiting.get(id) ?? [];
      list.push(task);
      waiting.set(id, list);
    }
  }
  return (from) => {
    // The tasks reachable from `from`, every task before those waiting for
    // it: the reverse of a depth-first postorder. Each visited once, so a
    // cycle ends.
    const visited = new Set<TaskId>([from]);
    const postorder: ShiftTask[] = [];
    const visit = (task: ShiftTask) => {
      for (const next of waiting.get(task.id) ?? []) {
        if (visited.has(next.id)) continue;
        visited.add(next.id);
        visit(next);
      }
      postorder.push(task);
    };
    for (const next of waiting.get(from) ?? []) {
      if (visited.has(next.id)) continue;
      visited.add(next.id);
      visit(next);
    }
    const moved = new Map<TaskId, ShiftedDates>();
    const lookup: DependencyLookup = (id) => {
      const task = byId.get(id);
      if (!task) return undefined;
      const dates = moved.get(id);
      return dates ? { status: task.status, due: dates.due } : task;
    };
    const plan: ShiftedDates[] = [];
    for (const task of postorder.reverse()) {
      if (task.start === null || !hasDateConflict(task, lookup)) continue;
      // In conflict: some dependency takes part, its date after the start.
      const start = earliestStart(task, lookup);
      if (start === null) continue;
      const days = daysBetween(task.start, start);
      const dates = {
        id: task.id,
        start,
        due: task.due === null ? null : addDays(task.due, days),
      };
      moved.set(task.id, dates);
      plan.push(dates);
    }
    return plan;
  };
}
