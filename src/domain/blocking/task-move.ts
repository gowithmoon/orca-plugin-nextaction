// Moving a task (#63 "用例：移动任务"): where its block, with every block
// below it, goes, and the snapshot as it would stand afterwards. Pure.
import type { ProjectId } from "../project/project";
import type { TaskId } from "../task/task";
import type { SnapshotTask, TaskGraphSnapshot } from "./task-graph";

/**
 * Where the moved block goes, relative to the target's block: its last child
 * block, or just before or after it, as a sibling.
 */
export type MovePlacement = "lastChild" | "before" | "after";

/** A task's block, with every block below it, moved next to a target task. */
export interface TaskMoveNextToTask {
  readonly id: TaskId;
  readonly target: TaskId;
  readonly placement: MovePlacement;
}

/**
 * A task's block, with every block below it, moved to the end of project
 * `projectEnd`'s block: its last child block (#170), making it a project root
 * task there. The project's block, page or block, need not be a task.
 */
export interface TaskMoveToProjectEnd {
  readonly id: TaskId;
  readonly projectEnd: ProjectId;
}

/**
 * Where a task's block goes: next to a task, or to the end of a project's
 * block. A project is never a `target`: only a move next to a task has one.
 */
export type TaskMove = TaskMoveNextToTask | TaskMoveToProjectEnd;

/** The move goes to the end of a project's block (#170). */
export function movesToProjectEnd(
  move: TaskMove,
): move is TaskMoveToProjectEnd {
  return "projectEnd" in move;
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
 * The move puts the task onto itself or below itself: a target task that is
 * the moved task or one of its descendant tasks, or a project whose block is
 * the moved task's or sits below it (ADR 0025 lets a project block sit below
 * a task).
 */
export function movesOntoSelfOrBelow(
  snapshot: TaskGraphSnapshot,
  move: TaskMove,
): boolean {
  if (!movesToProjectEnd(move)) {
    return isSelfOrBelow(snapshot, move.target, move.id);
  }
  if (move.projectEnd === move.id) return true;
  const project = (snapshot.projects ?? []).find(
    (entry) => entry.project.id === move.projectEnd,
  );
  return (
    project?.parentId !== undefined &&
    isSelfOrBelow(snapshot, project.parentId, move.id)
  );
}

/**
 * Block `id` (a task's or a project's) sits below project block `project`,
 * going up by parent tasks and nearest project blocks: between them they
 * reach every task and project above it.
 */
function isBelowProjectBlock(
  snapshot: TaskGraphSnapshot,
  id: number,
  project: ProjectId,
): boolean {
  const tasks = new Map(snapshot.tasks.map((item) => [item.task.id, item]));
  const projects = new Map(
    (snapshot.projects ?? []).map((entry) => [entry.project.id, entry]),
  );
  /** The nearest task and the nearest project block above block `of`. */
  const above = (of: number): number[] => {
    const task = tasks.get(of);
    const entry = projects.get(of);
    return [
      task?.parentId,
      task?.projectBlock,
      entry?.parentId,
      entry?.projectBlock,
    ].filter((next): next is number => next !== null && next !== undefined);
  };
  const seen = new Set<number>([id]);
  const pending = above(id);
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next === project) return true;
    if (seen.has(next)) continue;
    seen.add(next);
    pending.push(...above(next));
  }
  return false;
}

/** Where a move puts the moved task among the other tasks (`rest`). */
interface Landing {
  /** Its index in `rest`. */
  readonly insertAt: number;
  readonly parentId: TaskId | null;
  /** Its nearest project block afterwards; `undefined` for none. */
  readonly projectBlock: ProjectId | undefined;
}

/** A move next to task `move.target`; `null` when it is not a task. */
function landingNextToTask(
  snapshot: TaskGraphSnapshot,
  rest: readonly SnapshotTask[],
  move: TaskMoveNextToTask,
): Landing | null {
  const targetIndex = rest.findIndex((item) => item.task.id === move.target);
  const target = rest[targetIndex];
  if (!target) return null;
  /** Just after the target's last descendant task (or the target itself). */
  let afterTarget = targetIndex + 1;
  while (
    afterTarget < rest.length &&
    isSelfOrBelow(
      snapshot,
      (rest[afterTarget] as SnapshotTask).task.id,
      move.target,
    )
  ) {
    afterTarget += 1;
  }
  // The nearest project block (#157): as the last child, the target's block
  // if it is a project, else the target's own nearest one; as a sibling, the
  // target's.
  const targetIsProject = (snapshot.projects ?? []).some(
    (entry) => entry.project.id === move.target,
  );
  return {
    insertAt: move.placement === "before" ? targetIndex : afterTarget,
    parentId: move.placement === "lastChild" ? move.target : target.parentId,
    projectBlock:
      move.placement === "lastChild" && targetIsProject
        ? move.target
        : target.projectBlock,
  };
}

/**
 * A move to the end of project `move.projectEnd`'s block (#170): after every
 * task below the block, the block its nearest project block; its parent
 * task the block when that is a task too, else the block's own parent task.
 * `null` when it is not a project.
 */
function landingAtProjectEnd(
  snapshot: TaskGraphSnapshot,
  rest: readonly SnapshotTask[],
  move: TaskMoveToProjectEnd,
): Landing | null {
  const project = (snapshot.projects ?? []).find(
    (entry) => entry.project.id === move.projectEnd,
  );
  if (!project) return null;
  // The tasks below the block come right after it (document preorder).
  let insertAt = rest.findIndex((item) => item.position > project.position);
  if (insertAt === -1) insertAt = rest.length;
  while (
    insertAt < rest.length &&
    isBelowProjectBlock(
      snapshot,
      (rest[insertAt] as SnapshotTask).task.id,
      move.projectEnd,
    )
  ) {
    insertAt += 1;
  }
  const isTask = snapshot.tasks.some(
    (item) => item.task.id === move.projectEnd,
  );
  return {
    insertAt,
    parentId: isTask ? move.projectEnd : (project.parentId ?? null),
    projectBlock: move.projectEnd,
  };
}

/**
 * The snapshot after the move: the moved task gets its new parent task, and
 * it and its descendant tasks their new places, in the order they had. Only
 * the tasks are known, not the plain blocks among them, so a block that is
 * last below the target comes after the target's last descendant task.
 * Positions are renumbered from 0. `null` when the move cannot be made: a
 * task or project not in the snapshot, or a move onto the moved task or
 * below it (`movesOntoSelfOrBelow`).
 */
export function movedSnapshot(
  snapshot: TaskGraphSnapshot,
  move: TaskMove,
): TaskGraphSnapshot | null {
  const ordered = [...snapshot.tasks].sort((a, b) => a.position - b.position);
  const moved = ordered.find((item) => item.task.id === move.id);
  if (!moved) return null;
  if (movesOntoSelfOrBelow(snapshot, move)) return null;
  const inSubtree = (item: SnapshotTask) =>
    isSelfOrBelow(snapshot, item.task.id, move.id);
  const subtree = ordered.filter(inSubtree);
  const rest = ordered.filter((item) => !inSubtree(item));
  const landing = movesToProjectEnd(move)
    ? landingAtProjectEnd(snapshot, rest, move)
    : landingNextToTask(snapshot, rest, move);
  if (!landing) return null;
  const { insertAt, parentId, projectBlock: newBlock } = landing;
  // Below the moved task, those that had its old nearest project block get
  // the new one; a project block within the subtree stays theirs.
  const oldBlock = moved.projectBlock;
  const withBlock = (item: SnapshotTask): SnapshotTask => {
    if (item !== moved && item.projectBlock !== oldBlock) return item;
    const { projectBlock: _old, ...rest } = item;
    return newBlock === undefined ? rest : { ...rest, projectBlock: newBlock };
  };
  const order = [
    ...rest.slice(0, insertAt),
    ...subtree.map((item) =>
      withBlock(item === moved ? { ...item, parentId } : item),
    ),
    ...rest.slice(insertAt),
  ];
  return {
    ...snapshot,
    tasks: order.map((item, position) => ({ ...item, position })),
  };
}

/**
 * The move leaves every task where it is: each keeps its parent task, its
 * nearest project block (#157) and its place among the others. Plain blocks are not in the snapshot, so a move
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
      .map((item) => `${item.task.id}:${item.parentId}:${item.projectBlock}`)
      .join(",");
  return arrangement(after.tasks) === arrangement(snapshot.tasks);
}
