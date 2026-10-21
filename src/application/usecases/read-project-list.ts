import {
  type ProjectStatus,
  projectListOrder,
} from "../../domain/project/project";
import { projectScore } from "../../domain/scoring/score";
import type { CalendarDate } from "../../domain/task/task";
import { projectNodeContext, projectNodesInNoteOrder } from "./project-nodes";
import type { ProjectNode } from "./read-all-tasks";
import {
  readTodaysTaskGraph,
  type TaskGraphReading,
} from "./todays-task-graph";

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

export function createReadProjectList(deps: TaskGraphReading): ReadProjectList {
  return async () => {
    const read = await readTodaysTaskGraph(deps);
    if (read.snapshot.projectsPaused) return { kind: "paused" };
    const nodes = projectNodesInNoteOrder(
      projectNodeContext(read),
      read.snapshot,
    );
    return { kind: "projects", groups: groupProjects(nodes, read.today) };
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
