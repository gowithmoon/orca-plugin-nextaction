// Dependency cycles (GLOSSARY: 循环依赖, ADR 0015): the three kinds of
// blocking taken together as one "who waits for whom" graph, by structure
// only, statuses ignored:
//
// - X depends on Y: X and every descendant task of X wait for Y.
// - A parent task waits for each of its direct subtasks.
// - Under a sequential parent, a later subtask and every descendant task of
//   it wait for each earlier sibling subtask.
// - A stale dependency (its target is not a task) is not in the graph.
//
// A task on a cycle of this graph can never be a next action. The same
// graph answers "would this change make a cycle", so what the task panel
// refuses and what reading shows agree. Pure.
import type { TaskId } from "../task/task";
import type { SnapshotTask, TaskGraphSnapshot } from "./task-graph";
import { isSelfOrBelow, movedSnapshot, type TaskMove } from "./task-move";
import { buildTaskRelations, type TaskRelations } from "./task-relations";

/**
 * Every task `item` waits for directly in the waits-for graph, once each:
 * its own direct relations (subtasks, the subtask just before it under a
 * sequential parent, its dependencies), and the dependencies and sequential
 * wait of every ancestor task, passed down to it (ADR 0015). Waiting for
 * every earlier sibling is reached through the one just before: it waits
 * for the one before it, and so on. Only reachability decides cycles, so
 * one edge stands for all, and a long sequential list does not grow the
 * graph quadratically.
 */
function waitsFor(
  structure: TaskRelations<SnapshotTask>,
  item: SnapshotTask,
): Set<TaskId> {
  const targets = new Set<TaskId>();
  for (const relation of structure.waitsFor(item.task.id)) {
    targets.add(relation.waitingFor);
  }
  for (const ancestor of structure.ancestorsOf(item.task.id)) {
    for (const relation of structure.waitsFor(ancestor.task.id)) {
      // Only these pass down: waiting for its subtasks stays with it.
      if (relation.kind === "dependency" || relation.kind === "sequential") {
        targets.add(relation.waitingFor);
      }
    }
  }
  return targets;
}

/** The waits-for graph: what each task waits for directly. */
function waitsForGraph(
  structure: TaskRelations<SnapshotTask>,
): Map<TaskId, Set<TaskId>> {
  return new Map(
    structure.tasks.map((item) => [item.task.id, waitsFor(structure, item)]),
  );
}

/**
 * The strongly connected component of every task, as a component number
 * (Tarjan's algorithm, iterative so a deep graph cannot overflow the stack).
 */
function components(
  structure: TaskRelations<SnapshotTask>,
  graph: ReadonlyMap<TaskId, ReadonlySet<TaskId>>,
): Map<TaskId, number> {
  const index = new Map<TaskId, number>();
  const low = new Map<TaskId, number>();
  const component = new Map<TaskId, number>();
  const stack: TaskId[] = [];
  const onStack = new Set<TaskId>();
  let next = 0;
  let count = 0;
  for (const root of structure.tasks) {
    if (index.has(root.task.id)) continue;
    const work: { id: TaskId; targets: Iterator<TaskId> }[] = [];
    const visit = (id: TaskId) => {
      index.set(id, next);
      low.set(id, next);
      next += 1;
      stack.push(id);
      onStack.add(id);
      work.push({ id, targets: (graph.get(id) ?? new Set()).values() });
    };
    visit(root.task.id);
    while (work.length > 0) {
      const frame = work[work.length - 1] as (typeof work)[number];
      const step = frame.targets.next();
      if (!step.done) {
        const target = step.value;
        if (!index.has(target)) visit(target);
        else if (onStack.has(target)) {
          low.set(
            frame.id,
            Math.min(low.get(frame.id) as number, index.get(target) as number),
          );
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) {
        low.set(
          parent.id,
          Math.min(low.get(parent.id) as number, low.get(frame.id) as number),
        );
      }
      if (low.get(frame.id) === index.get(frame.id)) {
        let member: TaskId | undefined;
        do {
          member = stack.pop() as TaskId;
          onStack.delete(member);
          component.set(member, count);
        } while (member !== frame.id);
        count += 1;
      }
    }
  }
  return component;
}

/**
 * The tasks on a dependency cycle, each with the tasks on that cycle it
 * waits for directly, in note order (itself, when it waits for itself);
 * under a sequential parent, that is the earlier sibling just before.
 * Tasks on no cycle are not in the map.
 */
export function findDependencyCycles(
  snapshot: TaskGraphSnapshot,
): ReadonlyMap<TaskId, readonly TaskId[]> {
  return dependencyCyclesIn(buildTaskRelations(snapshot.tasks));
}

/** As `findDependencyCycles`, from task relations already built. */
export function dependencyCyclesIn(
  structure: TaskRelations<SnapshotTask>,
): ReadonlyMap<TaskId, readonly TaskId[]> {
  const graph = waitsForGraph(structure);
  const component = components(structure, graph);
  const cycles = new Map<TaskId, TaskId[]>();
  for (const item of structure.tasks) {
    const id = item.task.id;
    const onCycle = [...(graph.get(id) ?? [])]
      .filter((target) => component.get(target) === component.get(id))
      .sort(
        (a, b) =>
          (structure.get(a)?.position ?? 0) - (structure.get(b)?.position ?? 0),
      );
    if (onCycle.length > 0) cycles.set(id, onCycle);
  }
  return cycles;
}

/** The task and every descendant task of it, in note order. */
function subtree(structure: TaskRelations<SnapshotTask>, id: TaskId): TaskId[] {
  const found: TaskId[] = [];
  const pending = [id];
  const seen = new Set<TaskId>();
  while (pending.length > 0) {
    const next = pending.pop() as TaskId;
    if (seen.has(next)) continue;
    seen.add(next);
    found.push(next);
    for (const child of structure.childrenOf(next)) {
      pending.push(child.task.id);
    }
  }
  const position = (task: TaskId) => structure.get(task)?.position ?? 0;
  return found.sort((a, b) => position(a) - position(b));
}

/**
 * Why depending on a target would make a dependency cycle:
 * - `below`: the target is the task itself or one of its descendant tasks,
 *   which already wait for it as subtasks do.
 * - `waits`: the target already waits for the task, or for something below
 *   it (through dependencies, subtasks or sequential order).
 */
export type DependencyCycleReason = "below" | "waits";

/**
 * The tasks that task `id` cannot depend on without making a dependency
 * cycle, each with why. A task not in the map is safe to add. Adding a
 * dependency on Y makes the task and everything below it wait for Y, so it
 * makes a cycle exactly when Y already reaches one of them: one reverse
 * search from the task's subtree marks every candidate at once.
 */
export function dependencyTargetsThatCycle(
  snapshot: TaskGraphSnapshot,
  id: TaskId,
): ReadonlyMap<TaskId, DependencyCycleReason> {
  const structure = buildTaskRelations(snapshot.tasks);
  const marked = new Map<TaskId, DependencyCycleReason>();
  if (!structure.get(id)) return marked;
  /**
   * Who waits for each task directly: the waits-for graph reversed. Not the
   * relations' waiters: the graph also passes waiting down to descendants.
   */
  const waitedOnBy = new Map<TaskId, TaskId[]>();
  for (const [waiting, targets] of waitsForGraph(structure)) {
    for (const target of targets) {
      const waiters = waitedOnBy.get(target) ?? [];
      waiters.push(waiting);
      waitedOnBy.set(target, waiters);
    }
  }
  const pending: TaskId[] = [];
  for (const below of subtree(structure, id)) {
    marked.set(below, "below");
    pending.push(below);
  }
  while (pending.length > 0) {
    const next = pending.pop() as TaskId;
    for (const waiter of waitedOnBy.get(next) ?? []) {
      if (marked.has(waiter)) continue;
      marked.set(waiter, "waits");
      pending.push(waiter);
    }
  }
  return marked;
}

/**
 * The reverse of `dependencyTargetsThatCycle`: the tasks that cannot depend
 * on task `id` without making a dependency cycle, each with why, from the
 * same graph. Task X depending on `id` makes X and everything below it wait
 * for `id`, so it makes a cycle exactly when `id` is below X (`below`) or
 * `id` already waits for X or something below it (`waits`): one search
 * forward from `id` finds what it waits for, and each of those and its
 * ancestor tasks are marked. The task itself is not in the map.
 */
export function dependentsThatCycle(
  snapshot: TaskGraphSnapshot,
  id: TaskId,
): ReadonlyMap<TaskId, DependencyCycleReason> {
  const structure = buildTaskRelations(snapshot.tasks);
  const marked = new Map<TaskId, DependencyCycleReason>();
  if (!structure.get(id)) return marked;
  for (const ancestor of structure.ancestorsOf(id)) {
    marked.set(ancestor.task.id, "below");
  }
  const graph = waitsForGraph(structure);
  const reached = new Set<TaskId>();
  const pending = [id];
  while (pending.length > 0) {
    const next = pending.pop() as TaskId;
    for (const target of graph.get(next) ?? []) {
      if (reached.has(target)) continue;
      reached.add(target);
      pending.push(target);
    }
  }
  for (const target of reached) {
    if (target === id) continue;
    if (!marked.has(target)) marked.set(target, "waits");
    for (const ancestor of structure.ancestorsOf(target)) {
      if (ancestor.task.id === id || marked.has(ancestor.task.id)) continue;
      marked.set(ancestor.task.id, "waits");
    }
  }
  return marked;
}

/**
 * The targets in `targets` that would make a dependency cycle if task `id`
 * depended on them, in the order given. Targets it already depends on are
 * left alone (keeping or removing a dependency never makes a cycle), and so
 * are stale ones.
 */
export function targetsThatCycle(
  snapshot: TaskGraphSnapshot,
  id: TaskId,
  targets: readonly TaskId[],
): TaskId[] {
  // A stale target left among them is never marked: it is not in the graph.
  const held = new Set(
    buildTaskRelations(snapshot.tasks)
      .waitsFor(id)
      .filter((relation) => relation.kind === "dependency")
      .map((relation) => relation.waitingFor),
  );
  const added = targets.filter((target) => !held.has(target));
  if (added.length === 0) return [];
  const marked = dependencyTargetsThatCycle(snapshot, id);
  return added.filter((target) => marked.has(target));
}

/**
 * A wait that turning sequential on would put on a dependency cycle: task
 * `waiting` (a later subtask, or something below one) would wait for the
 * earlier subtask `waitingFor`, which already waits for it.
 */
export interface SequentialCycle {
  readonly waiting: TaskId;
  readonly waitingFor: TaskId;
}

/**
 * Whether turning sequential on for task `id` would make a dependency cycle:
 * the first such wait in note order, or `null` when none would (also when the
 * task is sequential already, or not a task).
 */
export function sequentialCycle(
  snapshot: TaskGraphSnapshot,
  id: TaskId,
): SequentialCycle | null {
  const parent = snapshot.tasks.find((item) => item.task.id === id);
  if (!parent || parent.task.sequential) return null;
  const after = buildTaskRelations(
    snapshot.tasks.map((item) =>
      item === parent
        ? { ...item, task: { ...item.task, sequential: true } }
        : item,
    ),
  );
  const component = components(after, waitsForGraph(after));
  /** The first subtask so far on each component, by component number. */
  const earliest = new Map<number | undefined, TaskId>();
  for (const later of after.childrenOf(id)) {
    for (const waiting of subtree(after, later.task.id)) {
      const waitingFor = earliest.get(component.get(waiting));
      if (waitingFor !== undefined) return { waiting, waitingFor };
    }
    const own = component.get(later.task.id);
    if (!earliest.has(own)) earliest.set(own, later.task.id);
  }
  return null;
}

/** The task that a move would put on a dependency cycle with the moved one. */
export interface MoveCycle {
  readonly cycleWith: TaskId;
}

/**
 * Whether moving a task (with every task below it) would make a dependency
 * cycle: a task not on a cycle before is on one after the move. Moving out
 * of a cycle that already stands, or within it, is not refused. `cycleWith`
 * names the task the moved ones would wait for each other with: the first
 * one in note order on that cycle outside the moved subtree, or, when the
 * cycle stays inside it (a new ancestor task depends on a task being moved
 * below it), that ancestor task, the nearest first. `null` when no cycle
 * would be made, and when the move cannot be made at all (a task not in the
 * snapshot, or a target that is the moved task or below it).
 */
export function moveCycle(
  snapshot: TaskGraphSnapshot,
  move: TaskMove,
): MoveCycle | null {
  const after = movedSnapshot(snapshot, move);
  if (!after) return null;
  const before = findDependencyCycles(snapshot);
  const afterStructure = buildTaskRelations(after.tasks);
  const graph = waitsForGraph(afterStructure);
  const component = components(afterStructure, graph);
  const onCycleAfter = findDependencyCycles(after);
  const made = afterStructure.tasks.find(
    (item) => onCycleAfter.has(item.task.id) && !before.has(item.task.id),
  );
  if (!made) return null;
  const cycle = component.get(made.task.id);
  const members = afterStructure.tasks.filter(
    (item) => component.get(item.task.id) === cycle,
  );
  // The moved subtree is the same before and after the move.
  const below = (id: TaskId) => isSelfOrBelow(afterStructure, id, move.id);
  const position = (id: TaskId) =>
    snapshot.tasks.find((item) => item.task.id === id)?.position ?? 0;
  const outside = members
    .map((item) => item.task.id)
    .filter((id) => !below(id))
    .sort((a, b) => position(a) - position(b));
  if (outside[0] !== undefined) return { cycleWith: outside[0] };
  const memberIds = new Set(members.map((item) => item.task.id));
  for (const ancestor of afterStructure.ancestorsOf(move.id)) {
    const dependsOnMember = afterStructure
      .waitsFor(ancestor.task.id)
      .some(
        (relation) =>
          relation.kind === "dependency" && memberIds.has(relation.waitingFor),
      );
    if (dependsOnMember) {
      return { cycleWith: ancestor.task.id };
    }
  }
  return { cycleWith: move.id };
}
