// Moving a task (#63 "用例：移动任务"): where its block, with every block
// below it, goes, and the snapshot as it would stand afterwards. Pure.
import type { TaskId } from "../task/task";
import type { SnapshotTask, TaskGraphSnapshot } from "./task-graph";

/**
 * Where the moved block goes, relative to the target's block: its last child
 * block, or just before or after it, as a sibling.
 */
export type MovePlacement = "lastChild" | "before" | "after";

/** A task's block, with every block below it, moved next to a target task. */
export interface TaskMove {
  readonly id: TaskId;
  readonly target: TaskId;
  readonly placement: MovePlacement;
}

/** Task `id` is task `ancestor` or one of its descendant tasks. */
export function isSelfOrBelow(
  snapshot: TaskGraphSnapshot,
  id: TaskId,
  ancestor: TaskId,
): boolean {
  const parents = new Map(
    snapshot.tasks.map((item) => [item.task.id, item.parentId]),
  );
  const seen = new Set<TaskId>();
  let current: TaskId | null | undefined = id;
  while (current !== null && current !== undefined && !seen.has(current)) {
    if (current === ancestor) return true;
    seen.add(current);
    current = parents.get(current);
  }
  return false;
}

/**
 * The snapshot after the move: the moved task gets its new parent task, and
 * it and its descendant tasks their new places, in the order they had. Only
 * the tasks are known, not the plain blocks among them, so a block that is
 * last below the target comes after the target's last descendant task.
 * Positions are renumbered from 0. `null` when the move cannot be made: a task
 * not in the snapshot, or a target that is the moved task or below it.
 */
export function movedSnapshot(
  snapshot: TaskGraphSnapshot,
  move: TaskMove,
): TaskGraphSnapshot | null {
  const ordered = [...snapshot.tasks].sort((a, b) => a.position - b.position);
  const moved = ordered.find((item) => item.task.id === move.id);
  const target = ordered.find((item) => item.task.id === move.target);
  if (!moved || !target) return null;
  if (isSelfOrBelow(snapshot, move.target, move.id)) return null;
  const inSubtree = (item: SnapshotTask, root: TaskId) =>
    isSelfOrBelow(snapshot, item.task.id, root);
  const subtree = ordered.filter((item) => inSubtree(item, move.id));
  const rest = ordered.filter((item) => !inSubtree(item, move.id));
  const targetIndex = rest.indexOf(target);
  /** Just after the target's last descendant task (or the target itself). */
  let afterTarget = targetIndex + 1;
  while (
    afterTarget < rest.length &&
    inSubtree(rest[afterTarget] as SnapshotTask, move.target)
  ) {
    afterTarget += 1;
  }
  const insertAt = move.placement === "before" ? targetIndex : afterTarget;
  const parentId =
    move.placement === "lastChild" ? move.target : target.parentId;
  const order = [
    ...rest.slice(0, insertAt),
    ...subtree.map((item) => (item === moved ? { ...item, parentId } : item)),
    ...rest.slice(insertAt),
  ];
  return { tasks: order.map((item, position) => ({ ...item, position })) };
}

/**
 * The move leaves every task where it is: each keeps its parent task and its
 * place among the others. Plain blocks are not in the snapshot, so a move
 * that only changes where the task sits among plain blocks counts as none.
 * `false` when the move cannot be made (see `movedSnapshot`).
 */
export function leavesTasksInPlace(
  snapshot: TaskGraphSnapshot,
  move: TaskMove,
): boolean {
  const after = movedSnapshot(snapshot, move);
  if (!after) return false;
  const arrangement = (tasks: readonly SnapshotTask[]) =>
    [...tasks]
      .sort((a, b) => a.position - b.position)
      .map((item) => `${item.task.id}:${item.parentId}`)
      .join(",");
  return arrangement(after.tasks) === arrangement(snapshot.tasks);
}
