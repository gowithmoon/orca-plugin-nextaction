// Use case: read the project list (GLOSSARY: 项目视图, #155): every project,
// grouped by project status in `projectListOrder`, each with what the
// project row shows (GLOSSARY: 项目行).
import { analyzeTaskGraph } from "../../domain/blocking/task-graph";
import {
  type ProjectStatus,
  projectListOrder,
} from "../../domain/project/project";
import { projectScore } from "../../domain/scoring/score";
import type { CalendarDate } from "../../domain/task/task";
import { addDays } from "../../domain/time/calendar-days";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";
import { projectNode, summarizeProjects } from "./project-nodes";
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
    const boundary = deps.dayBoundary.current();
    const today = logicalDay(deps.clock.now(), boundary);
    const previewDays = deps.startPreviewDays.current();
    const graph = analyzeTaskGraph(snapshot, { today, previewDays });
    const context = {
      summaries: summarizeProjects(snapshot, graph),
      today,
      startsBy: addDays(today, previewDays),
      boundary,
    };
    const nodes = [...(snapshot.projects ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(({ project }) => projectNode(context, project, []));
    return { kind: "projects", groups: groupProjects(nodes, today) };
  };
}

/**
 * `nodes`, given in note order, grouped as the project list groups them:
 * by project status in `projectListOrder`, the highest score first in each
 * group (ties keep note order), groups without a project left out. The
 * review's projects step groups the same way.
 */
export function groupProjects(
  nodes: readonly ProjectNode[],
  today: CalendarDate,
): ProjectGroup[] {
  const scoreOf = new Map(
    nodes.map((node) => [node.project.id, projectScore(node.project, today)]),
  );
  const scored = (node: ProjectNode) => scoreOf.get(node.project.id) ?? 0;
  return projectListOrder.flatMap((status) => {
    const projects = nodes
      .filter((node) => node.project.status === status)
      // Stable, so ties keep note order.
      .sort((a, b) => scored(b) - scored(a));
    return projects.length === 0 ? [] : [{ status, projects }];
  });
}
