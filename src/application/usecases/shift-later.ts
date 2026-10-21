// Use case: shift later the tasks after a task (GLOSSARY: 顺延, #184), from
// the gantt chart's notice and a bar's context menu. Reads the task graph
// afresh and writes the plan the chart counted, by the same planner.

import {
  type ShiftLaterPlan,
  shiftLaterPlanner,
} from "../../domain/blocking/shift-later";
import type { TaskGraph } from "../../domain/blocking/task-graph";
import type { ProjectId } from "../../domain/project/project";
import type { TaskId } from "../../domain/task/task";
import {
  readTodaysTaskGraph,
  type TaskGraphReading,
} from "./todays-task-graph";

/**
 * Shifts later the tasks after task `id` that conflict, in one undo: those
 * of `id`'s project, not done. Resolves to how many were shifted; 0 when
 * none conflicts (or `id` belongs to no project), nothing written. Errors
 * are thrown as they are, for `ui` to report.
 */
export type ShiftLater = (id: TaskId) => Promise<number>;

/**
 * The shifting plan among the tasks of `project` not done (#176: tasks
 * outside the project and done ones never move). Shared by the gantt
 * chart's read, so its count is what this writes.
 */
export function projectShiftPlanner(
  graph: TaskGraph,
  project: ProjectId,
): ShiftLaterPlan {
  return shiftLaterPlanner(
    graph.relations,
    (task) =>
      task.status !== "done" && graph.entry(task.id)?.project?.id === project,
  );
}

export function createShiftLater(deps: TaskGraphReading): ShiftLater {
  return async (id) => {
    const { graph } = await readTodaysTaskGraph(deps);
    const project = graph.entry(id)?.project;
    if (!project) return 0;
    const plan = projectShiftPlanner(graph, project.id)(id);
    if (plan.length === 0) return 0;
    await deps.repository.updateTasks(
      plan.map(({ id: shifted, start, due }) => ({
        id: shifted,
        // Only the start for a task with no due date: none is made up.
        changes: due === null ? { start } : { start, due },
      })),
    );
    return plan.length;
  };
}
