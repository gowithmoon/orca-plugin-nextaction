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

/** The tasks of a snapshot, with who sits below whom. */
interface Structure {
  /** In note order. */
  readonly ordered: readonly SnapshotTask[];
  readonly byId: ReadonlyMap<TaskId, SnapshotTask>;
  /** The direct subtasks of each task, in note order. */
  readonly children: ReadonlyMap<TaskId, readonly SnapshotTask[]>;
  /** The sibling subtask just before each task, if any. */
  readonly previous: ReadonlyMap<TaskId, SnapshotTask>;
}

function structureOf(tasks: readonly SnapshotTask[]): Structure {
  const ordered = [...tasks].sort((a, b) => a.position - b.position);
  const byId = new Map(ordered.map((item) => [item.task.id, item]));
  const children = new Map<TaskId, SnapshotTask[]>();
  const previous = new Map<TaskId, SnapshotTask>();
  for (const item of ordered) {
    if (item.parentId === null || !byId.has(item.parentId)) continue;
    const siblings = children.get(item.parentId) ?? [];
    const before = siblings.at(-1);
    if (before) previous.set(item.task.id, before);
    siblings.push(item);
    children.set(item.parentId, siblings);
  }
  return { ordered, byId, children, previous };
}

/**
 * The task and its ancestor tasks, nearest first. A parent not in the
 * snapshot ends the chain; a chain that loops back is cut where it does (the
 * block tree cannot loop, so this only guards against bad input).
 */
function selfAndAncestors(
  structure: Structure,
  item: SnapshotTask,
): SnapshotTask[] {
  const chain = [item];
  const seen = new Set([item.task.id]);
  let parentId = item.parentId;
  while (parentId !== null && !seen.has(parentId)) {
    const parent = structure.byId.get(parentId);
    if (!parent) break;
    chain.push(parent);
    seen.add(parentId);
    parentId = parent.parentId;
  }
  return chain;
}

/** Every task `item` waits for directly in the waits-for graph, once each. */
function waitsFor(structure: Structure, item: SnapshotTask): Set<TaskId> {
  const targets = new Set<TaskId>();
  for (const child of structure.children.get(item.task.id) ?? []) {
    targets.add(child.task.id);
  }
  for (const link of selfAndAncestors(structure, item)) {
    for (const target of link.task.dependencies) {
      if (structure.byId.has(target)) targets.add(target);
    }
    const parent =
      link.parentId === null ? undefined : structure.byId.get(link.parentId);
    if (!parent?.task.sequential) continue;
    // Waiting for every earlier sibling is reached through the one just
    // before: it waits for the one before it, and so on. Only reachability
    // decides cycles, so one edge stands for all, and a long sequential list
    // does not grow the graph quadratically.
    const previous = structure.previous.get(link.task.id);
    if (previous) targets.add(previous.task.id);
  }
  return targets;
}

/** The waits-for graph: what each task waits for directly. */
function waitsForGraph(structure: Structure): Map<TaskId, Set<TaskId>> {
  return new Map(
    structure.ordered.map((item) => [item.task.id, waitsFor(structure, item)]),
  );
}

/**
 * The strongly connected component of every task, as a component number
 * (Tarjan's algorithm, iterative so a deep graph cannot overflow the stack).
 */
function components(
  structure: Structure,
  graph: ReadonlyMap<TaskId, ReadonlySet<TaskId>>,
): Map<TaskId, number> {
  const index = new Map<TaskId, number>();
  const low = new Map<TaskId, number>();
  const component = new Map<TaskId, number>();
  const stack: TaskId[] = [];
  const onStack = new Set<TaskId>();
  let next = 0;
  let count = 0;
  for (const root of structure.ordered) {
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
  const structure = structureOf(snapshot.tasks);
  const graph = waitsForGraph(structure);
  const component = components(structure, graph);
  const cycles = new Map<TaskId, TaskId[]>();
  for (const item of structure.ordered) {
    const id = item.task.id;
    const onCycle = [...(graph.get(id) ?? [])]
      .filter((target) => component.get(target) === component.get(id))
      .sort(
        (a, b) =>
          (structure.byId.get(a)?.position ?? 0) -
          (structure.byId.get(b)?.position ?? 0),
      );
    if (onCycle.length > 0) cycles.set(id, onCycle);
  }
  return cycles;
}

/** The task and every descendant task of it, in note order. */
function subtree(structure: Structure, id: TaskId): TaskId[] {
  const found: TaskId[] = [];
  const pending = [id];
  const seen = new Set<TaskId>();
  while (pending.length > 0) {
    const next = pending.pop() as TaskId;
    if (seen.has(next)) continue;
    seen.add(next);
    found.push(next);
    for (const child of structure.children.get(next) ?? []) {
      pending.push(child.task.id);
    }
  }
  const position = (task: TaskId) => structure.byId.get(task)?.position ?? 0;
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
  const structure = structureOf(snapshot.tasks);
  const marked = new Map<TaskId, DependencyCycleReason>();
  if (!structure.byId.has(id)) return marked;
  /** Who waits for each task directly: the waits-for graph reversed. */
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
  const held = new Set(
    snapshot.tasks.find((item) => item.task.id === id)?.task.dependencies,
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
  const after = structureOf(
    snapshot.tasks.map((item) =>
      item === parent
        ? { ...item, task: { ...item.task, sequential: true } }
        : item,
    ),
  );
  const component = components(after, waitsForGraph(after));
  /** The first subtask so far on each component, by component number. */
  const earliest = new Map<number | undefined, TaskId>();
  for (const later of after.children.get(id) ?? []) {
    for (const waiting of subtree(after, later.task.id)) {
      const waitingFor = earliest.get(component.get(waiting));
      if (waitingFor !== undefined) return { waiting, waitingFor };
    }
    const own = component.get(later.task.id);
    if (!earliest.has(own)) earliest.set(own, later.task.id);
  }
  return null;
}
