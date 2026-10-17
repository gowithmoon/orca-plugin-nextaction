// Date conflicts (GLOSSARY: 日期冲突): a task's own start before what its
// dependencies' own due dates and its dependency delay allow. Only the dates
// the tasks wrote count, never ones borrowed from the project. Only a hint:
// it changes neither next actions nor blocking, and it is never stored.
// Pure; works on a task and a lookup of the tasks it depends on, so the
// gantt chart's read (#183) and shifting later (#184) judge alike.

import type { CalendarDate, Task, TaskId } from "../task/task";
import { addDays, compareDays } from "../time/calendar-days";

/** What is judged of the waiting task. */
export type ConflictTask = Pick<
  Task,
  "start" | "dependencies" | "dependencyMode" | "dependencyDelay"
>;

/** What is judged of a task depended on. */
export type ConflictDependency = Pick<Task, "status" | "due">;

/**
 * The task depended on, by its ID; `undefined` when it is no longer a task
 * (GLOSSARY: 失效依赖).
 */
export type DependencyLookup = (id: TaskId) => ConflictDependency | undefined;

/**
 * The own due date of a dependency that takes part: its task not done, not
 * stale, with a due date of its own; `null` when it takes no part.
 */
function dueTakingPart(
  id: TaskId,
  lookup: DependencyLookup,
): CalendarDate | null {
  const dependency = lookup(id);
  if (!dependency || dependency.status === "done") return null;
  return dependency.due;
}

/**
 * The earliest start `task`'s dependencies allow: the latest of their due
 * dates in mode "all", the earliest in mode "any" (GLOSSARY: 依赖模式), plus
 * its dependency delay. `null` when no dependency takes part.
 */
export function earliestStart(
  task: ConflictTask,
  lookup: DependencyLookup,
): CalendarDate | null {
  let picked: CalendarDate | null = null;
  for (const id of task.dependencies) {
    const due = dueTakingPart(id, lookup);
    if (due === null) continue;
    const order = compareDays(due, picked ?? due);
    if (
      picked === null ||
      (task.dependencyMode === "all" ? order > 0 : order < 0)
    ) {
      picked = due;
    }
  }
  return picked === null ? null : addDays(picked, task.dependencyDelay);
}

/**
 * Whether `task` has a date conflict: its own start before
 * `earliestStart`. A task without a start of its own never has.
 */
export function hasDateConflict(
  task: ConflictTask,
  lookup: DependencyLookup,
): boolean {
  if (task.start === null) return false;
  const earliest = earliestStart(task, lookup);
  return earliest !== null && compareDays(task.start, earliest) < 0;
}

/**
 * Whether the dependency on `dependency` is one that `task`'s date conflict
 * comes from (its arrow drawn red): `task` has a date conflict, and this
 * dependency takes part, its due date plus the delay after `task`'s start.
 */
export function dependencyConflicts(
  task: ConflictTask,
  dependency: TaskId,
  lookup: DependencyLookup,
): boolean {
  if (task.start === null || !hasDateConflict(task, lookup)) return false;
  const due = dueTakingPart(dependency, lookup);
  if (due === null) return false;
  return compareDays(task.start, addDays(due, task.dependencyDelay)) < 0;
}
