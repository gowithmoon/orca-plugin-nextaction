// A tree move in the project details that crosses the project block's
// boundary (#157): the moved task sits under the project's block before the
// move and not after, or the other way round. "Under the project block": its
// nearest project block (GLOSSARY: 所属项目) is the project's; another
// project block in between means not. What the move does to the task's
// 所属项目 is worked out on the moved snapshot. Pure.
import { owningProject } from "../project/ownership";
import type { ProjectId } from "../project/project";
import type { TaskId } from "../task/task";
import type { SnapshotTask, TaskGraphSnapshot } from "./task-graph";
import { movedSnapshot, type TaskMove } from "./task-move";
import { buildTaskRelations } from "./task-relations";

/**
 * What a crossing move does to the moved task, seen from project `project`:
 * - `moveIn`: it goes under the project block, still the project's;
 * - `moveOut`: it leaves the project block, still the project's;
 * - `noProject`: it leaves the project block and belongs to no project;
 * - `otherProject`: it belongs to project `project` afterwards, another one.
 */
export type ProjectBlockCrossing =
  | { readonly kind: "moveIn" | "moveOut" | "noProject" }
  | { readonly kind: "otherProject"; readonly project: ProjectId };

/**
 * What the move does to the moved task when it crosses the block of project
 * `project`; `null` when it does not cross it, or cannot be made (see
 * `movedSnapshot`). Other refusals of the move are the caller's to check.
 */
export function projectBlockCrossing(
  snapshot: TaskGraphSnapshot,
  move: TaskMove,
  project: ProjectId,
): ProjectBlockCrossing | null {
  const after = movedSnapshot(snapshot, move);
  if (!after) return null;
  const blockOf = (graph: TaskGraphSnapshot) =>
    graph.tasks.find((item) => item.task.id === move.id)?.projectBlock;
  const underBefore = blockOf(snapshot) === project;
  const underAfter = blockOf(after) === project;
  if (underBefore === underAfter) return null;
  const owner = owningProjectOf(after, move.id);
  if (owner === project) return { kind: underAfter ? "moveIn" : "moveOut" };
  if (owner === null) return { kind: "noProject" };
  return { kind: "otherProject", project: owner };
}

/** The project task `id` belongs to in `snapshot`, `null` for none. */
function owningProjectOf(
  snapshot: TaskGraphSnapshot,
  id: TaskId,
): ProjectId | null {
  const relations = buildTaskRelations(snapshot.tasks);
  const projects = new Set(
    (snapshot.projects ?? []).map((entry) => entry.project.id),
  );
  // The task and its ancestor tasks, nearest first.
  const self = relations.get(id);
  const chain: SnapshotTask[] = self
    ? [self, ...relations.ancestorsOf(id)]
    : [];
  return owningProject(chain, (p) => projects.has(p));
}
