// Use case: drop a project from the project menu (GLOSSARY: 放弃项目; #150).
// The tasks belonging to it are worked out with the ownership rule (ADR 0025),
// so a task under the project block and one set to it count alike.
import type { TaskGraphSnapshot } from "../../domain/blocking/task-graph";
import { buildTaskRelations } from "../../domain/blocking/task-relations";
import { owningProject } from "../../domain/project/ownership";
import type { Project, ProjectId } from "../../domain/project/project";
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";
import { NotAProjectError } from "../ports/task-repository";

/** What dropping a project would do, for the user to confirm. */
export interface DropProjectPlan {
  readonly project: Project;
  /** How many of its tasks are not done: they would be dropped with it. */
  readonly openTasks: number;
}

/**
 * The plan for dropping project `id`. Throws `NotAProjectError` when the
 * block is not a project; other errors are thrown as they are.
 */
export type ReadDropProjectPlan = (id: ProjectId) => Promise<DropProjectPlan>;

/**
 * Drops project `id` in one undo: its project tag goes, every task belonging
 * to it that is not done is dropped (GLOSSARY: 放弃), and every 所属项目
 * setting pointing at it is cleared; done tasks stay. The tasks are worked
 * out afresh, not taken from an earlier plan. Throws `NotAProjectError` when
 * the block is not a project; other errors are thrown as they are, for `ui`
 * to report.
 */
export type DropProject = (id: ProjectId) => Promise<void>;

/** The tasks belonging to `id` that are not done, in no particular order. */
function openTasksOf(snapshot: TaskGraphSnapshot, id: ProjectId): TaskId[] {
  const relations = buildTaskRelations(snapshot.tasks);
  const projects = new Set(
    (snapshot.projects ?? []).map((entry) => entry.project.id),
  );
  const open: TaskId[] = [];
  for (const item of snapshot.tasks) {
    if (item.task.status === "done") continue;
    // The task and its ancestor tasks, nearest first, as the task graph
    // walks them.
    const chain = [item, ...relations.ancestorsOf(item.task.id)];
    if (owningProject(chain, (p) => projects.has(p)) === id) {
      open.push(item.task.id);
    }
  }
  return open;
}

/** The project and its open tasks, or `NotAProjectError`. */
async function readPlan(repository: TaskRepository, id: ProjectId) {
  const [project, snapshot] = await Promise.all([
    repository.getProject(id),
    repository.readTaskGraph(),
  ]);
  if (!project) throw new NotAProjectError(id);
  return { project, tasks: openTasksOf(snapshot, project.id) };
}

export function createReadDropProjectPlan(deps: {
  repository: TaskRepository;
}): ReadDropProjectPlan {
  return async (id) => {
    const { project, tasks } = await readPlan(deps.repository, id);
    return { project, openTasks: tasks.length };
  };
}

export function createDropProject(deps: {
  repository: TaskRepository;
}): DropProject {
  return async (id) => {
    const { project, tasks } = await readPlan(deps.repository, id);
    await deps.repository.dropProject(project.id, tasks);
  };
}
