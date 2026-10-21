// Use case: what the task panel shows of a task's place among the others,
// from one read of today's task graph (ADR 0007): why it is not a next
// action, with its dependencies; the tasks it can depend on; the tasks it
// blocks; its 所属项目 and the projects it can be given. Each part was read on
// its own before, the graph once per part on every change.
import type { TaskId } from "../../domain/task/task";
import {
  type DependencyCandidate,
  dependencyCandidatesIn,
} from "./read-dependency-candidates";
import {
  type NotNextActionReasonsRead,
  notNextActionReasonsIn,
} from "./read-not-next-action-reasons";
import {
  type ProjectCandidate,
  projectCandidatesIn,
} from "./read-project-candidates";
import {
  type ProjectOfTaskRead,
  projectOfTaskIn,
} from "./read-project-of-task";
import { type Waiter, waitersIn } from "./read-waiters";
import {
  readTodaysTaskGraph,
  type TaskGraphReading,
} from "./todays-task-graph";

export interface TaskPanelRelations {
  /** Why it is not a next action, with its own dependencies (#54, #57, #78). */
  readonly reasons: NotNextActionReasonsRead;
  /** The tasks it can depend on (#57, #60), in no particular order. */
  readonly dependencyCandidates: readonly DependencyCandidate[];
  /** The tasks it blocks (#208, GLOSSARY: 它阻塞的任务). */
  readonly waiters: readonly Waiter[];
  /** Its 所属项目 (#146). */
  readonly projectOfTask: ProjectOfTaskRead;
  /** The projects it can be given, in note order (#146). */
  readonly projectCandidates: readonly ProjectCandidate[];
}

/**
 * Reads the relations of task `id`. Errors are thrown as they are.
 */
export type ReadTaskPanelRelations = (
  id: TaskId,
) => Promise<TaskPanelRelations>;

export function createReadTaskPanelRelations(
  deps: TaskGraphReading,
): ReadTaskPanelRelations {
  return async (id) => {
    const { snapshot, graph } = await readTodaysTaskGraph(deps);
    const { relations } = graph;
    // The graph holds source blocks only: an ID not among its tasks may be a
    // mirror's, read as its source's (ARCHITECTURE: mirrors resolve at the
    // repository). Most reads stop at the one graph read.
    const source = relations.get(id)
      ? id
      : ((await deps.repository.getTask(id))?.id ?? id);
    return {
      reasons: notNextActionReasonsIn(graph, source),
      dependencyCandidates: dependencyCandidatesIn(snapshot, source),
      waiters: waitersIn(relations, source),
      projectOfTask: projectOfTaskIn(snapshot, relations, source),
      projectCandidates: projectCandidatesIn(snapshot, source),
    };
  };
}
