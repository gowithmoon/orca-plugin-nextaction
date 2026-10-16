// What a project's tasks say about it (GLOSSARY: 进度, 缺少下一步行动):
// its progress, whether it lacks a next action, and how many of its tasks are
// not done. "Its tasks" are those that belong to it (GLOSSARY: 所属项目),
// however they do; the caller works that out with `owningProject`. Pure.
import type { Effort, TaskStatus } from "../task/task";
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
