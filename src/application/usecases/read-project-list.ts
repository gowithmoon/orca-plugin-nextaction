// Use case: read the project list (GLOSSARY: 项目视图, #155): every project,
// grouped by project status in `projectListOrder`, each with what the
// project row shows (GLOSSARY: 项目行).
import { analyzeTaskGraph } from "../../domain/blocking/task-graph";
import {
  lacksNextAction,
  type ProjectTask,
  projectProgress,
  unfinishedTaskCount,
} from "../../domain/project/progress";
import {
  type ProjectId,
  type ProjectStatus,
  projectListOrder,
} from "../../domain/project/project";
import { recurs } from "../../domain/recurrence/recurrence";
import { projectScore } from "../../domain/scoring/score";
import { addDays, compareDays } from "../../domain/time/calendar-days";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";
import type { ProjectNode } from "./read-all-tasks";

/** The projects of one project status. */
export interface ProjectGroup {
  readonly status: ProjectStatus;
  /** Never empty. Project nodes without children, as the project row takes. */
  readonly projects: readonly ProjectNode[];
}

/**
 * - `projects`: the groups in `projectListOrder`, those without a project
 *   left out (none at all: no project).
 * - `paused`: the project tag is paused (#143); there is no project to list.
 */
export type ProjectListRead =
  | {
      readonly kind: "projects";
      readonly groups: readonly ProjectGroup[];
    }
  | { readonly kind: "paused" };

/** Reads the project list. Errors are thrown as they are. */
export type ReadProjectList = () => Promise<ProjectListRead>;

export function createReadProjectList(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}): ReadProjectList {
  return async () => {
    const snapshot = await deps.repository.readTaskGraph();
    if (snapshot.projectsPaused) return { kind: "paused" };
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const previewDays = deps.startPreviewDays.current();
    const graph = analyzeTaskGraph(snapshot, { today, previewDays });
    const startsBy = addDays(today, previewDays);
    // The tasks that belong to each project, through the task graph, which
    // works ownership out (GLOSSARY: 所属项目).
    const tasksOf = new Map<ProjectId, ProjectTask[]>();
    for (const item of snapshot.tasks) {
      const entry = graph.entry(item.task.id);
      if (!entry?.project) continue;
      const tasks = tasksOf.get(entry.project.id) ?? [];
      tasks.push({
        status: item.task.status,
        effort: item.task.effort,
        recurs: recurs(item.task.recurrence),
        doneAncestor: entry.doneAncestor !== null,
        nextAction: entry.nextAction,
      });
      tasksOf.set(entry.project.id, tasks);
    }
    const nodes = [...(snapshot.projects ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(({ project }): ProjectNode => {
        const tasks = tasksOf.get(project.id) ?? [];
        const notStarted =
          project.start !== null && compareDays(project.start, startsBy) > 0;
        return {
          kind: "project",
          project,
          faded: null,
          children: [],
          progress: projectProgress(tasks),
          noNextAction: lacksNextAction(project, !notStarted, tasks),
          unfinished: unfinishedTaskCount(tasks),
          taskCount: tasks.length,
          notStarted,
        };
      });
    // Highest score first; stable, so ties keep note order.
    const scoreOf = new Map(
      nodes.map((node) => [node.project.id, projectScore(node.project, today)]),
    );
    const scored = (node: ProjectNode) => scoreOf.get(node.project.id) ?? 0;
    const groups = projectListOrder.flatMap((status) => {
      const projects = nodes
        .filter((node) => node.project.status === status)
        .sort((a, b) => scored(b) - scored(a));
      return projects.length === 0 ? [] : [{ status, projects }];
    });
    return { kind: "projects", groups };
  };
}
