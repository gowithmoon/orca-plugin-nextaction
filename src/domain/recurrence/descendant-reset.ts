// Resetting the descendant tasks of a recurring task as it advances
// (GLOSSARY: 进入下一次). Pure.
import type { CalendarDate, Task, TaskId } from "../task/task";
import type { TaskChanges } from "../task/task-changes";
import { addDays, daysBetween } from "../time/calendar-days";

/** A task of the task graph, as resetting needs it. */
export interface DescendantCandidate {
  readonly task: Pick<Task, "id" | "status" | "start" | "due" | "recurrence">;
  /** Its nearest task ancestor (ADR 0003), `null` for none. */
  readonly parentId: TaskId | null;
}

/** A descendant task to write, with what to write. */
export interface DescendantReset {
  readonly id: TaskId;
  readonly changes: TaskChanges;
}

/**
 * What resetting the descendant tasks plans. `unreadable`: a done
 * descendant task's rule cannot be read, so whether it keeps to a rule of
 * its own is unknown; nothing is to be written.
 */
export type DescendantResetPlan =
  | { readonly kind: "resets"; readonly resets: readonly DescendantReset[] }
  | {
      readonly kind: "unreadable";
      readonly id: TaskId;
      readonly reason: string;
    };

/**
 * The descendant tasks to reset as task `advanced` advances to `next`
 * (GLOSSARY: 进入下一次), at any depth, in the order of `graph`: each done
 * one without a rule of its own (a paused one is still its own) goes back
 * to todo, its dates moved by as many days as the task moved. Those not
 * done, and those with a rule, are left as they are. No completion is
 * recorded for them.
 */
export function planDescendantResets(
  advanced: Pick<Task, "id" | "start" | "due">,
  next: CalendarDate,
  graph: readonly DescendantCandidate[],
): DescendantResetPlan {
  // The days the task moved by: from its due date, else its start date. A
  // task without dates moved nothing (the next occurrence is written as its
  // start), so its descendants' dates stay as they are.
  const from = advanced.due ?? advanced.start;
  const shift = from === null ? undefined : daysBetween(from, next);
  const done = descendantsOf(advanced.id, graph).filter(
    (task) => task.status === "done",
  );
  for (const task of done) {
    if (task.recurrence.kind === "unreadable") {
      return {
        kind: "unreadable",
        id: task.id,
        reason: task.recurrence.reason,
      };
    }
  }
  const resets = done
    .filter((task) => task.recurrence.kind === "none")
    .map((task) => {
      const changes: TaskChanges = {
        status: "todo",
        ...(shift !== undefined &&
          task.start !== null && { start: addDays(task.start, shift) }),
        ...(shift !== undefined &&
          task.due !== null && { due: addDays(task.due, shift) }),
      };
      return { id: task.id, changes };
    });
  return { kind: "resets", resets };
}

/** Every descendant task of `id`, at any depth, in the order of `graph`. */
function descendantsOf(
  id: TaskId,
  graph: readonly DescendantCandidate[],
): DescendantCandidate["task"][] {
  const below = new Set<TaskId>([id]);
  // Parents may come after their children in `graph`: repeat until no more
  // are found. A cycle in the parent links cannot add a task twice.
  for (let found = true; found; ) {
    found = false;
    for (const { task, parentId } of graph) {
      if (parentId !== null && below.has(parentId) && !below.has(task.id)) {
        below.add(task.id);
        found = true;
      }
    }
  }
  return graph
    .map(({ task }) => task)
    .filter((task) => task.id !== id && below.has(task.id));
}
