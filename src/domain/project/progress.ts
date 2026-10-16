// What a project's tasks say about it (GLOSSARY: 进度, 缺少下一步行动, 长期
// 无进展, 逾期项目): its progress, whether it lacks a next action or has no
// recent progress, whether it is overdue, and how many of its tasks are not
// done. "Its tasks" are those that belong to it (GLOSSARY: 所属项目),
// however they do; the caller works that out with `owningProject`. Pure.
import type { CalendarDate, Effort, TaskStatus } from "../task/task";
import { compareDays, daysBetween, laterDay } from "../time/calendar-days";
import { type DayBoundary, logicalDay } from "../time/logical-day";
import { type Project, projectAllowsNextAction } from "./project";

/** What the rules here read of one task that belongs to the project. */
export interface ProjectTask {
  readonly status: TaskStatus;
  readonly effort: Effort;
  /** It is a recurring task (GLOSSARY: 重复任务). */
  readonly recurs: boolean;
  /** Some ancestor task is done (ADR 0017). */
  readonly doneAncestor: boolean;
  /** It is a next action (GLOSSARY: 下一步行动). */
  readonly nextAction: boolean;
}

/**
 * A project's progress (GLOSSARY: 进度):
 * - `noTasks`: no task belongs to it.
 * - `uncounted`: some do, but none counts (all someday or recurring).
 * - `measured`: the effort of the counted tasks done, of all counted.
 */
export type ProjectProgress =
  | { readonly kind: "noTasks" }
  | { readonly kind: "uncounted" }
  | {
      readonly kind: "measured";
      readonly done: number;
      readonly total: number;
    };

/**
 * Weighted by effort; parent and subtask each count with their own. Someday
 * and recurring tasks do not count; one below a done ancestor task counts as
 * done.
 */
export function projectProgress(
  tasks: readonly ProjectTask[],
): ProjectProgress {
  if (tasks.length === 0) return { kind: "noTasks" };
  const counted = tasks.filter(
    (task) => task.status !== "someday" && !task.recurs,
  );
  if (counted.length === 0) return { kind: "uncounted" };
  let done = 0;
  let total = 0;
  for (const task of counted) {
    total += task.effort;
    if (task.status === "done" || task.doneAncestor) done += task.effort;
  }
  return { kind: "measured", done, total };
}

/**
 * The project lacks a next action (GLOSSARY: 缺少下一步行动): active, its
 * start reached (`started`, the start preview days counted), and none of its
 * tasks a next action or waiting.
 */
export function lacksNextAction(
  project: Project,
  started: boolean,
  tasks: readonly ProjectTask[],
): boolean {
  return (
    projectAllowsNextAction(project.status) &&
    started &&
    !tasks.some((task) => task.nextAction || task.status === "waiting")
  );
}

/**
 * How many of its tasks are not done: those dropping the project drops
 * (GLOSSARY: 放弃项目), and the N of a done project still holding some.
 */
export function unfinishedTaskCount(tasks: readonly ProjectTask[]): number {
  return tasks.filter((task) => task.status !== "done").length;
}

/** Days after the latest progress that make no recent progress; fixed. */
export const noProgressThresholdDays = 14;

/** What the tasks that belong to a project say about its latest progress. */
export interface ProjectActivity {
  /** The logical day of their latest last completion; `null` for none. */
  readonly lastCompletion: CalendarDate | null;
  /** When the latest of them was created; `null` for none. */
  readonly lastTaskCreated: Date | null;
}

/**
 * How many logical days the project has gone without progress (GLOSSARY: 长
 * 期无进展), once that is `noProgressThresholdDays` or more; `null` otherwise.
 */
export function daysWithoutProgress(
  project: Project,
  started: boolean,
  activity: ProjectActivity,
  today: CalendarDate,
  boundary: DayBoundary,
): number | null {
  if (!projectAllowsNextAction(project.status) || !started) return null;
  const taskCreated =
    activity.lastTaskCreated && logicalDay(activity.lastTaskCreated, boundary);
  const latest =
    [activity.lastCompletion, taskCreated, project.start].reduce(
      laterDay,
      logicalDay(project.created, boundary),
    ) ?? today;
  const days = daysBetween(latest, today);
  return days >= noProgressThresholdDays ? days : null;
}

/**
 * The project is overdue (GLOSSARY: 逾期项目): not done, and its own due day
 * is before `today`; its tasks' due days do not count.
 */
export function projectOverdue(
  project: Pick<Project, "status" | "due">,
  today: CalendarDate,
): boolean {
  return (
    project.due !== null &&
    project.status !== "done" &&
    compareDays(project.due, today) < 0
  );
}
