// Shared by the use cases that read project rows (GLOSSARY: 项目行): the all
// tasks view's tree and the project list.
import type {
  TaskGraph,
  TaskGraphSnapshot,
} from "../../domain/blocking/task-graph";
import {
  lacksNextAction,
  type ProjectTask,
  projectProgress,
  unfinishedTaskCount,
} from "../../domain/project/progress";
import type { Project, ProjectId } from "../../domain/project/project";
import { recurs } from "../../domain/recurrence/recurrence";
import type { CompletionEntry } from "../../domain/task/completion-history";
import type { CalendarDate } from "../../domain/task/task";
import { compareDays } from "../../domain/time/calendar-days";
import type { AllTasksNode, ProjectNode } from "./read-all-tasks";

/** What the tasks that belong to a project say about it. */
export interface ProjectSummary {
  readonly tasks: readonly ProjectTask[];
  /** The latest last completion among them; absent for none recorded. */
  readonly lastCompletion?: CompletionEntry;
}

/**
 * The tasks that belong to each project, by its ID: through the task graph,
 * which works ownership out (GLOSSARY: 所属项目), never from the block
 * hierarchy alone.
 */
export function summarizeProjects(
  snapshot: TaskGraphSnapshot,
  graph: TaskGraph,
): Map<ProjectId, ProjectSummary> {
  const summaries = new Map<
    ProjectId,
    { tasks: ProjectTask[]; lastCompletion?: CompletionEntry }
  >();
  for (const item of snapshot.tasks) {
    const entry = graph.entry(item.task.id);
    if (!entry?.project) continue;
    const summary = summaries.get(entry.project.id) ?? { tasks: [] };
    summary.tasks.push({
      status: item.task.status,
      effort: item.task.effort,
      recurs: recurs(item.task.recurrence),
      doneAncestor: entry.doneAncestor !== null,
      nextAction: entry.nextAction,
    });
    const last = item.lastCompletion;
    if (
      last &&
      (!summary.lastCompletion ||
        last.at.getTime() > summary.lastCompletion.at.getTime())
    )
      summary.lastCompletion = last;
    summaries.set(entry.project.id, summary);
  }
  return summaries;
}

/**
 * The node of `project` with `children` below it, from what `summaries`
 * says about its tasks; `startsBy` is the last start that is reached (today
 * plus the start preview days).
 */
export function projectNode(
  summaries: ReadonlyMap<ProjectId, ProjectSummary>,
  startsBy: CalendarDate,
  project: Project,
  children: readonly AllTasksNode[],
): ProjectNode {
  const tasks = summaries.get(project.id)?.tasks ?? [];
  const notStarted =
    project.start !== null && compareDays(project.start, startsBy) > 0;
  return {
    kind: "project",
    project,
    faded: null,
    children,
    progress: projectProgress(tasks),
    noNextAction: lacksNextAction(project, !notStarted, tasks),
    unfinished: unfinishedTaskCount(tasks),
    taskCount: tasks.length,
    notStarted,
  };
}
