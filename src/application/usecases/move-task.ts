// Use case: move a task, with every block below it, next to another task
// (#63 "用例：移动任务", #70). Refused, writing nothing, when the target is the
// task itself or below it, when it would leave a task that is not a page
// without a parent block, or when the move would make a dependency cycle
// (ADR 0015).
import { moveCycle } from "../../domain/blocking/dependency-cycles";
import type { TaskGraphSnapshot } from "../../domain/blocking/task-graph";
import {
  isSelfOrBelow,
  leavesTasksInPlace,
  type TaskMove,
} from "../../domain/blocking/task-move";
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";
import { DependencyCycleError } from "./dependency-cycle-error";

/**
 * Why a move was refused. `onto-self-or-below`: the target is the moved task
 * or one of its descendant tasks. `page-level-only-pages`: placed before or
 * after a page with no parent block, a task's block would have none either,
 * and only a page is a task there (ADR 0013, move-blocks P2).
 */
export type MoveRefusal = "onto-self-or-below" | "page-level-only-pages";

/** Nothing was written; `ui` tells the user why. */
export class MoveRefusedError extends Error {
  override name = "MoveRefusedError";

  constructor(readonly reason: MoveRefusal) {
    super("The move was refused");
  }
}

/**
 * Moves task `id` to `placement` relative to task `target`, in one undo.
 * Fails, writing nothing, with `MoveRefusedError` when the target is the task
 * itself or below it, or when a task that is not a page would have no parent
 * block, and with `DependencyCycleError` when the move would make
 * a dependency cycle. A move that leaves every task where it is writes
 * nothing. Other errors are thrown as they are, for `ui` to report.
 */
export type MoveTask = (move: TaskMove) => Promise<void>;

/**
 * What the move use case makes of `move` on `snapshot`, checked in this
 * order: refused (`refused`, or `cycle` naming the task it would make one
 * with), nothing to write (`inPlace`), else `move`. Shared with the project
 * details' crossing check (#157), so both refuse alike.
 */
export type MoveCheck =
  | { readonly kind: "refused"; readonly reason: MoveRefusal }
  | { readonly kind: "inPlace" }
  | { readonly kind: "cycle"; readonly cycleWith: TaskId }
  | { readonly kind: "move" };

export function checkMove(
  snapshot: TaskGraphSnapshot,
  move: TaskMove,
): MoveCheck {
  if (isSelfOrBelow(snapshot, move.target, move.id)) {
    return { kind: "refused", reason: "onto-self-or-below" };
  }
  const item = (id: TaskId) =>
    snapshot.tasks.find((candidate) => candidate.task.id === id);
  if (
    move.placement !== "lastChild" &&
    item(move.target)?.root &&
    !item(move.id)?.page
  ) {
    return { kind: "refused", reason: "page-level-only-pages" };
  }
  // Nothing written, so the undo history gets no empty step (#63).
  if (leavesTasksInPlace(snapshot, move)) return { kind: "inPlace" };
  const cycle = moveCycle(snapshot, move);
  if (cycle) return { kind: "cycle", cycleWith: cycle.cycleWith };
  return { kind: "move" };
}

export function createMoveTask(deps: { repository: TaskRepository }): MoveTask {
  return async (move) => {
    const snapshot = await deps.repository.readTaskGraph();
    const check = checkMove(snapshot, move);
    if (check.kind === "refused") throw new MoveRefusedError(check.reason);
    if (check.kind === "inPlace") return;
    if (check.kind === "cycle") {
      const task = (id: TaskId) => ({
        id,
        text:
          snapshot.tasks.find((candidate) => candidate.task.id === id)?.task
            .text ?? "",
      });
      throw new DependencyCycleError({
        kind: "move",
        moved: task(move.id),
        cycleWith: task(check.cycleWith),
      });
    }
    await deps.repository.moveTask(move.id, move.target, move.placement);
  };
}
