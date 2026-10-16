// Use case: whether a tree move in the project details crosses the project
// block's boundary, and what it does to the task's 所属项目 (#157), for the
// user to confirm first. A move the move use case would refuse, or that
// leaves every task in place, asks nothing: it is refused (or does nothing)
// as before.
import { projectBlockCrossing } from "../../domain/blocking/project-block-crossing";
import type { TaskMove } from "../../domain/blocking/task-move";
import type { ProjectId } from "../../domain/project/project";
import type { TaskRepository } from "../ports/task-repository";
import { checkMove } from "./move-task";

/**
 * A crossing move, with the texts its question names: the moved task's,
 * project `project`'s, and for `otherProject` the project it would belong
 * to afterwards.
 */
export type MoveCrossing =
  | {
      readonly kind: "moveIn" | "moveOut" | "noProject";
      readonly task: string;
      readonly project: string;
    }
  | {
      readonly kind: "otherProject";
      readonly task: string;
      readonly project: string;
      readonly otherProject: string;
    };

/**
 * What `move` does when it crosses the block of project `project`; `null`
 * when it does not cross it, or the move use case would refuse it or write
 * nothing. Errors are thrown as they are.
 */
export type ReadMoveCrossing = (
  move: TaskMove,
  project: ProjectId,
) => Promise<MoveCrossing | null>;

export function createReadMoveCrossing(deps: {
  repository: TaskRepository;
}): ReadMoveCrossing {
  return async (move, project) => {
    const snapshot = await deps.repository.readTaskGraph();
    const item = (id: number) =>
      snapshot.tasks.find((candidate) => candidate.task.id === id);
    // Only a move the move use case would make asks.
    if (checkMove(snapshot, move).kind !== "move") return null;
    const crossing = projectBlockCrossing(snapshot, move, project);
    if (!crossing) return null;
    const projectText = (id: ProjectId) =>
      snapshot.projects?.find((entry) => entry.project.id === id)?.project
        .text ?? "";
    const texts = {
      task: item(move.id)?.task.text ?? "",
      project: projectText(project),
    };
    return crossing.kind === "otherProject"
      ? {
          kind: "otherProject",
          ...texts,
          otherProject: projectText(crossing.project),
        }
      : { kind: crossing.kind, ...texts };
  };
}
