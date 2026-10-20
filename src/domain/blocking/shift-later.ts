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
import { buildTaskRelations } from "./task-relations";

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
 * tasks waiting for it, in dependency order: a task waiting for the task
 * shifted from, or for one this plan moved, is judged; in conflict, it moves
 * its start to the earliest its dependencies allow (`earliestStart`), its
 * due date by as many days, and the tasks waiting for it are judged in turn
 * by its new dates. One not in conflict stays and pushes nothing on: a
 * conflict already after it is left as it is. A task reached along several
 * paths is judged once, after all of them, so it takes the latest date. A
 * cycle in the notes is cut where it closes; the task shifted from never
 * moves.
 */
export function shiftLaterPlanner(
  tasks: readonly ShiftTask[],
  movable: (task: ShiftTask) => boolean,
): ShiftLaterPlan {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  // Only the dependencies count here, so the tasks are related without
  // their parent tasks, in the order given.
  const relations = buildTaskRelations(
    tasks.map((task, position) => ({
      task: { id: task.id, sequential: false, dependencies: task.dependencies },
      parentId: null,
      position,
    })),
  );
  /** The movable tasks depending on each task (its 后续任务), in order. */
  const waiting = new Map<TaskId, ShiftTask[]>();
  for (const task of tasks) {
    waiting.set(
      task.id,
      relations
        .waitersOf(task.id)
        .filter((relation) => relation.kind === "dependency")
        .map((relation) => byId.get(relation.waiting) as ShiftTask)
        .filter(movable),
    );
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
      // Judged only after `from` or a task this plan moved: one left where
      // it is pushes nothing on, its own later conflicts stay as they are.
      const pushed = task.dependencies.some(
        (id) => id === from || moved.has(id),
      );
      if (!pushed) continue;
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
