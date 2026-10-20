// Use case: the task panel's 阻塞 row (#208, GLOSSARY: 它阻塞的任务): the
// tasks waiting for a task directly, from the task relations (#211).
import type { SnapshotTask } from "../../domain/blocking/task-graph";
import { buildTaskRelations } from "../../domain/blocking/task-relations";
import type { TaskId, TaskStatus } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Why a waiter waits for the task: `subtask`, it is the parent task;
 * `sequential`, it comes after the task under a sequential parent;
 * `dependency`, it depends on the task (后续任务).
 */
export type WaiterKind = "subtask" | "sequential" | "dependency";

/** A task waiting for the task, as the row shows it. */
export interface Waiter {
  readonly id: TaskId;
  /** As the notes hold it; may be empty. */
  readonly text: string;
  readonly status: TaskStatus;
  /** Every way it waits for the task, in the order the row lists them. */
  readonly kinds: readonly WaiterKind[];
}

/** Reads the waiters of task `id`. Errors are thrown as they are. */
export type ReadWaiters = (id: TaskId) => Promise<Waiter[]>;

export function createReadWaiters(deps: {
  repository: TaskRepository;
}): ReadWaiters {
  return async (id) => {
    const snapshot = await deps.repository.readTaskGraph();
    const relations = buildTaskRelations(snapshot.tasks);
    // The graph holds source blocks only: an ID not among its tasks may be a
    // mirror's, read as its source's (ARCHITECTURE: mirrors resolve at the
    // repository). Most reads stop at the one graph read.
    const source = relations.get(id)
      ? id
      : (await deps.repository.getTask(id))?.id;
    // A block that is not a task waits for nothing and blocks nothing.
    if (source === undefined || !relations.get(source)) return [];
    const found: { item: SnapshotTask; kind: WaiterKind }[] = [];
    const parent = relations.parentOf(source);
    if (parent) {
      found.push({ item: parent, kind: "subtask" });
      if (parent.task.sequential) {
        for (
          let later = relations.nextSiblingOf(source);
          later;
          later = relations.nextSiblingOf(later.task.id)
        ) {
          found.push({ item: later, kind: "sequential" });
        }
      }
    }
    // Its 后续任务, in note order.
    for (const relation of relations.waitersOf(source)) {
      const waiting = relations.get(relation.waiting);
      if (relation.kind === "dependency" && waiting) {
        found.push({ item: waiting, kind: "dependency" });
      }
    }
    // A task waiting in two ways is listed once, where it comes first.
    const merged = new Map<
      TaskId,
      { item: SnapshotTask; kinds: WaiterKind[] }
    >();
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
  };
}
