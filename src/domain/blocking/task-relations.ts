// The task relations (GLOSSARY: 它阻塞的任务, 父任务, 依赖, 顺序执行, #208): who
// waits for whom directly, built once from the tasks of a snapshot. Only the
// direct relations are held; the blocking rules that pass waiting down to
// descendant tasks (ADR 0015) live where they are judged (task-graph.ts,
// dependency-cycles.ts), put together from these queries. Pure.
import type { Task, TaskId } from "../task/task";

/** What the relations read of a task and where it sits (ADR 0003). */
export interface RelatedTask {
  readonly task: Pick<Task, "id" | "sequential" | "dependencies">;
  /** Its nearest task ancestor, `null` when it has none. */
  readonly parentId: TaskId | null;
  /** Its place in the notes (document preorder): lower comes first. */
  readonly position: number;
}

/**
 * Why `waiting` waits for `waitingFor` directly:
 * - `dependency`: `waiting` depends on `waitingFor` (依赖).
 * - `subtask`: `waitingFor` is a direct subtask of `waiting` (子任务阻塞).
 * - `sequential`: under a sequential parent, `waitingFor` is the subtask
 *   just before `waiting` (顺序阻塞). Only the one just before: waiting for
 *   every earlier one is reached through it, link by link.
 */
export type TaskRelationKind = "dependency" | "subtask" | "sequential";

export interface TaskRelation {
  readonly kind: TaskRelationKind;
  readonly waiting: TaskId;
  readonly waitingFor: TaskId;
}

/**
 * The relations among the tasks given. A stale dependency (its target not
 * among them, GLOSSARY: 失效依赖) is no relation; a task whose parent task
 * is not among them has none.
 */
export interface TaskRelations<T extends RelatedTask = RelatedTask> {
  /** Every task, in note order. */
  readonly tasks: readonly T[];
  /** The task `id`, `undefined` when it is not one. */
  get(id: TaskId): T | undefined;
  /** Its parent task (GLOSSARY: 父任务), `undefined` for none. */
  parentOf(id: TaskId): T | undefined;
  /** Its direct subtasks, in note order. */
  childrenOf(id: TaskId): readonly T[];
  /**
   * Its ancestor tasks, nearest first, itself not counting. A chain that
   * loops back is cut where it does (the block tree cannot loop, so this
   * only guards against bad input).
   */
  ancestorsOf(id: TaskId): readonly T[];
  /** The sibling subtask just after it, whether or not the parent is sequential. */
  nextSiblingOf(id: TaskId): T | undefined;
  /**
   * What task `id` waits for directly, each once: its direct subtasks (note
   * order), the subtask just before it under a sequential parent, then its
   * dependencies (in the order the notes hold them).
   */
  waitsFor(id: TaskId): readonly TaskRelation[];
  /**
   * The tasks waiting for task `id` directly (GLOSSARY: 它阻塞的任务, only the
   * direct ones), each once: its parent task, the subtask just after it
   * under a sequential parent, then the tasks depending on it (its 后续任务,
   * note order).
   */
  waitersOf(id: TaskId): readonly TaskRelation[];
}

export function buildTaskRelations<T extends RelatedTask>(
  tasks: readonly T[],
): TaskRelations<T> {
  const ordered = [...tasks].sort((a, b) => a.position - b.position);
  const byId = new Map(ordered.map((item) => [item.task.id, item]));
  const parent = new Map<TaskId, T>();
  const children = new Map<TaskId, T[]>();
  const previous = new Map<TaskId, T>();
  const next = new Map<TaskId, T>();
  for (const item of ordered) {
    const above = item.parentId === null ? undefined : byId.get(item.parentId);
    if (!above) continue;
    parent.set(item.task.id, above);
    const siblings = children.get(above.task.id) ?? [];
    const before = siblings.at(-1);
    if (before) {
      previous.set(item.task.id, before);
      next.set(before.task.id, item);
    }
    siblings.push(item);
    children.set(above.task.id, siblings);
  }

  const waitsFor = new Map<TaskId, TaskRelation[]>();
  const waiters = new Map<TaskId, TaskRelation[]>();
  const add = (relation: TaskRelation) => {
    const out = waitsFor.get(relation.waiting) ?? [];
    out.push(relation);
    waitsFor.set(relation.waiting, out);
    const into = waiters.get(relation.waitingFor) ?? [];
    into.push(relation);
    waiters.set(relation.waitingFor, into);
  };
  // Kind by kind, each in note order, so both directions list them so.
  for (const item of ordered) {
    const waiting = item.task.id;
    for (const child of children.get(waiting) ?? []) {
      add({ kind: "subtask", waiting, waitingFor: child.task.id });
    }
  }
  for (const item of ordered) {
    const before = previous.get(item.task.id);
    if (before && parent.get(item.task.id)?.task.sequential) {
      add({
        kind: "sequential",
        waiting: item.task.id,
        waitingFor: before.task.id,
      });
    }
  }
  for (const item of ordered) {
    for (const target of new Set(item.task.dependencies)) {
      if (!byId.has(target)) continue;
      add({ kind: "dependency", waiting: item.task.id, waitingFor: target });
    }
  }
  // The waiters of a task, one kind after another as the issue lists them.
  const kindOrder: Record<TaskRelationKind, number> = {
    subtask: 0,
    sequential: 1,
    dependency: 2,
  };
  for (const list of waiters.values()) {
    list.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]);
  }

  return {
    tasks: ordered,
    get: (id) => byId.get(id),
    parentOf: (id) => parent.get(id),
    childrenOf: (id) => children.get(id) ?? [],
    ancestorsOf: (id) => {
      const chain: T[] = [];
      const seen = new Set([id]);
      for (
        let above = parent.get(id);
        above && !seen.has(above.task.id);
        above = parent.get(above.task.id)
      ) {
        chain.push(above);
        seen.add(above.task.id);
      }
      return chain;
    },
    nextSiblingOf: (id) => next.get(id),
    waitsFor: (id) => waitsFor.get(id) ?? [],
    waitersOf: (id) => waiters.get(id) ?? [],
  };
}
