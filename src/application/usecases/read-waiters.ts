// Use case: the task panel's 阻塞 row (#208, GLOSSARY: 它阻塞的任务): the
// tasks waiting for a task directly, from the task relations (#211).
import type { SnapshotTask } from "../../domain/blocking/task-graph";
import type {
  TaskRelationKind,
  TaskRelations,
} from "../../domain/blocking/task-relations";
import type { TaskId, TaskStatus } from "../../domain/task/task";

/**
 * What a listed task is to the task: `parent`, its parent task (子任务阻塞);
 * `laterInSequence`, a subtask after it under a sequential parent (顺序阻塞);
 * `dependent`, a task depending on it (后续任务, 依赖阻塞).
 */
export type WaiterKind = "parent" | "laterInSequence" | "dependent";

/** A task waiting for the task, as the row shows it. */
export interface Waiter {
  readonly id: TaskId;
  /** As the notes hold it; may be empty. */
  readonly text: string;
  readonly status: TaskStatus;
  /** Every way it waits for the task, in the order the row lists them. */
  readonly kinds: readonly WaiterKind[];
}

/**
 * The waiters of task `source` (a source block's ID), from the task
 * relations; none when it is not a task.
 */
export function waitersIn(
  relations: TaskRelations<SnapshotTask>,
  source: TaskId,
): Waiter[] {
  // A block that is not a task waits for nothing and blocks nothing.
  if (!relations.get(source)) return [];
  const found: { item: SnapshotTask; kind: WaiterKind }[] = [];
  /** The tasks waiting for task `of` directly in the `kind` way. */
  const waitingOn = (of: TaskId, kind: TaskRelationKind) =>
    relations
      .waitersOf(of)
      .filter((relation) => relation.kind === kind)
      .map((relation) => relations.get(relation.waiting) as SnapshotTask);
  for (const parent of waitingOn(source, "subtask")) {
    found.push({ item: parent, kind: "parent" });
  }
  // Every later subtask, link by link along the sequential relations: each
  // waits for the one just before it. The block tree cannot loop, but a
  // task is visited once all the same.
  const seen = new Set<TaskId>([source]);
  for (
    let later = waitingOn(source, "sequential")[0];
    later && !seen.has(later.task.id);
    later = waitingOn(later.task.id, "sequential")[0]
  ) {
    seen.add(later.task.id);
    found.push({ item: later, kind: "laterInSequence" });
  }
  // Its 后续任务, in note order.
  for (const dependent of waitingOn(source, "dependency")) {
    found.push({ item: dependent, kind: "dependent" });
  }
  // A task waiting in two ways is listed once, where it comes first.
  const merged = new Map<TaskId, { item: SnapshotTask; kinds: WaiterKind[] }>();
  for (const { item, kind } of found) {
    // Someday and waiting ones count: only done ones no longer wait.
    if (item.task.status === "done") continue;
    const entry = merged.get(item.task.id);
    if (entry) entry.kinds.push(kind);
    else merged.set(item.task.id, { item, kinds: [kind] });
  }
  return [...merged.values()].map(({ item, kinds }) => ({
    id: item.task.id,
    text: item.task.text,
    status: item.task.status,
    kinds,
  }));
}
