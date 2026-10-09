// The task graph (GLOSSARY: 下一步行动, 阻塞, 搁置子树, 开始日期): which tasks
// are next actions, given every task with its parent task and its place in
// the notes. Pure; `today` is the current logical day, computed by the caller.
import type { CalendarDate, Task, TaskId } from "../task/task";
import { addDays, compareDays, laterDay } from "../time/calendar-days";

/** A task with where it sits among the others (ADR 0003). */
export interface SnapshotTask {
  readonly task: Task;
  /** Its nearest task ancestor, `null` when it has none. */
  readonly parentId: TaskId | null;
  /** Its place in the notes (document preorder): lower comes first. */
  readonly position: number;
}

/** Every task, done ones included, as they stand in the notes. */
export interface TaskGraphSnapshot {
  readonly tasks: readonly SnapshotTask[];
}

export interface TaskGraphOptions {
  /** The current logical day. */
  readonly today: CalendarDate;
  /**
   * How many days ahead an effective start may lie for the task to be a next
   * action already (the start preview setting); 0 for none.
   */
  readonly previewDays: number;
}

/**
 * Why a task is blocked (GLOSSARY: 阻塞), one entry per cause.
 *
 * - `subtasks` (子任务阻塞): direct subtasks neither done nor someday.
 */
export type BlockingReason = {
  readonly kind: "subtasks";
  /** The subtasks it waits for, in note order. */
  readonly waitingFor: readonly TaskId[];
};

/** What the graph says about one task. */
export interface TaskGraphEntry {
  readonly task: Task;
  readonly parentId: TaskId | null;
  /** Empty when nothing blocks it. */
  readonly blockedBy: readonly BlockingReason[];
  /**
   * In a parked subtree (GLOSSARY: 搁置子树): it or an ancestor task is
   * waiting or someday.
   */
  readonly parked: boolean;
  /**
   * The latest start among the task and all its ancestor tasks (GLOSSARY:
   * 开始日期, ADR 0015); `null` when none has one.
   */
  readonly effectiveStart: CalendarDate | null;
  readonly nextAction: boolean;
}

export interface TaskGraph {
  /** The next actions, in no particular order. */
  readonly nextActions: readonly TaskGraphEntry[];
  /** What the graph says about a task, `undefined` when it is not one. */
  entry(id: TaskId): TaskGraphEntry | undefined;
}

/** A subtask in these statuses does not hold its parent back. */
function releasesParent(task: Task): boolean {
  return task.status === "done" || task.status === "someday";
}

/** A task in these statuses parks itself and everything below it. */
function parks(task: Task): boolean {
  return task.status === "waiting" || task.status === "someday";
}

export function analyzeTaskGraph(
  snapshot: TaskGraphSnapshot,
  options: TaskGraphOptions,
): TaskGraph {
  /** The last effective start that still lets a task in. */
  const startsBy = addDays(options.today, options.previewDays);
  const ordered = [...snapshot.tasks].sort((a, b) => a.position - b.position);
  const byId = new Map(ordered.map((item) => [item.task.id, item]));
  /**
   * The task and its ancestor tasks, nearest first. A parent that is not in
   * the snapshot ends the chain; a chain that loops back is cut where it does
   * (the block tree cannot loop, so this only guards against bad input).
   */
  const selfAndAncestors = (item: SnapshotTask): SnapshotTask[] => {
    const chain = [item];
    const seen = new Set([item.task.id]);
    let parentId = item.parentId;
    while (parentId !== null && !seen.has(parentId)) {
      const parent = byId.get(parentId);
      if (!parent) break;
      chain.push(parent);
      seen.add(parentId);
      parentId = parent.parentId;
    }
    return chain;
  };
  const children = new Map<TaskId, SnapshotTask[]>();
  for (const item of ordered) {
    if (item.parentId === null) continue;
    const siblings = children.get(item.parentId) ?? [];
    siblings.push(item);
    children.set(item.parentId, siblings);
  }

  const entries = new Map<TaskId, TaskGraphEntry>();
  for (const item of ordered) {
    const blockedBy: BlockingReason[] = [];
    const waitingFor = (children.get(item.task.id) ?? [])
      .filter((child) => !releasesParent(child.task))
      .map((child) => child.task.id);
    if (waitingFor.length > 0) blockedBy.push({ kind: "subtasks", waitingFor });
    const chain = selfAndAncestors(item);
    const parked = chain.some((link) => parks(link.task));
    const effectiveStart = chain.reduce<CalendarDate | null>(
      (latest, link) => laterDay(latest, link.task.start),
      null,
    );
    const started =
      effectiveStart === null || compareDays(effectiveStart, startsBy) <= 0;
    const status = item.task.status;
    entries.set(item.task.id, {
      task: item.task,
      parentId: item.parentId,
      blockedBy,
      parked,
      effectiveStart,
      nextAction:
        (status === "todo" || status === "doing") &&
        blockedBy.length === 0 &&
        !parked &&
        started,
    });
  }

  const all = [...entries.values()];
  return {
    nextActions: all.filter((entry) => entry.nextAction),
    entry: (id) => entries.get(id),
  };
}
