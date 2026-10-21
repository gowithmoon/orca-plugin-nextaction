// Shared by the use cases that read project rows (GLOSSARY: 项目行): the all
// tasks view's tree, the project list and the review's projects step.
import type {
  TaskGraph,
  TaskGraphSnapshot,
} from "../../domain/blocking/task-graph";
import {
  daysWithoutProgress,
  lacksNextAction,
  type ProjectTask,
  projectOverdue,
  projectProgress,
  unfinishedTaskCount,
} from "../../domain/project/progress";
import type { Project, ProjectId } from "../../domain/project/project";
import { recurs } from "../../domain/recurrence/recurrence";
import type { CompletionEntry } from "../../domain/task/completion-history";
import type { CalendarDate } from "../../domain/task/task";
import { compareDays } from "../../domain/time/calendar-days";
import type { DayBoundary } from "../../domain/time/logical-day";
import type { AllTasksNode, ProjectNode } from "./read-all-tasks";
import type { TodaysTaskGraph } from "./todays-task-graph";

/** What the tasks that belong to a project say about it. */
export interface ProjectSummary {
  readonly tasks: readonly ProjectTask[];
  /** The latest last completion among them; absent for none recorded. */
  readonly lastCompletion?: CompletionEntry;
  /** When the latest of them was created; absent for no task. */
  readonly lastTaskCreated?: Date;
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
    {
      tasks: ProjectTask[];
      lastCompletion?: CompletionEntry;
      lastTaskCreated?: Date;
    }
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
    if (
      !summary.lastTaskCreated ||
      item.task.created.getTime() > summary.lastTaskCreated.getTime()
    )
      summary.lastTaskCreated = item.task.created;
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

/** What `projectNode` reads besides the project. */
export interface ProjectNodeContext {
  readonly summaries: ReadonlyMap<ProjectId, ProjectSummary>;
  /** The current logical day. */
  readonly today: CalendarDate;
  /** The last start that is reached: today plus the start preview days. */
  readonly startsBy: CalendarDate;
  /** Turns creation times into logical days (GLOSSARY: 长期无进展). */
  readonly boundary: DayBoundary;
}

/** The context of `projectNode` for today's task graph. */
export function projectNodeContext(read: TodaysTaskGraph): ProjectNodeContext {
  return {
    summaries: summarizeProjects(read.snapshot, read.graph),
    today: read.today,
    startsBy: read.startsBy,
    boundary: read.boundary,
  };
}

/** The nodes of the snapshot's projects, in note order, with no children. */
export function projectNodesInNoteOrder(
  context: ProjectNodeContext,
  snapshot: TaskGraphSnapshot,
): ProjectNode[] {
  return [...(snapshot.projects ?? [])]
    .sort((a, b) => a.position - b.position)
    .map(({ project }) => projectNode(context, project, []));
}

/**
 * The node of `project` with `children` below it, from what the context's
 * summaries say about its tasks.
 */
export function projectNode(
  context: ProjectNodeContext,
  project: Project,
  children: readonly AllTasksNode[],
): ProjectNode {
  const summary = context.summaries.get(project.id);
  const tasks = summary?.tasks ?? [];
  const notStarted =
    project.start !== null && compareDays(project.start, context.startsBy) > 0;
  return {
    kind: "project",
    project,
    faded: null,
    children,
    progress: projectProgress(tasks),
    noNextAction: lacksNextAction(project, !notStarted, tasks),
    noProgressDays: daysWithoutProgress(
      project,
      !notStarted,
      {
        lastCompletion: summary?.lastCompletion?.day ?? null,
        lastTaskCreated: summary?.lastTaskCreated ?? null,
      },
      context.today,
      context.boundary,
    ),
    overdue: projectOverdue(project, context.today),
    unfinished: unfinishedTaskCount(tasks),
    taskCount: tasks.length,
    notStarted,
  };
}
