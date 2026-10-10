// The task graph (GLOSSARY: 下一步行动, 阻塞, 搁置子树, 开始日期): which tasks
// are next actions, given every task with its parent task and its place in
// the notes. Pure; `today` is the current logical day, computed by the caller.
import type { CompletionEntry } from "../task/completion-history";
import type { CalendarDate, DependencyMode, Task, TaskId } from "../task/task";
import { addDays, compareDays, laterDay } from "../time/calendar-days";
import { findDependencyCycles } from "./dependency-cycles";

/** A task with where it sits among the others (ADR 0003). */
export interface SnapshotTask {
  readonly task: Task;
  /** Its nearest task ancestor, `null` when it has none. */
  readonly parentId: TaskId | null;
  /** Its place in the notes (document preorder): lower comes first. */
  readonly position: number;
  /**
   * The last entry of its completion history (GLOSSARY: 完成历史); absent
   * when it has none, or the history cannot be read.
   */
  readonly lastCompletion?: CompletionEntry;
  /** Its block is a page: it has an alias. Absent when it is not. */
  readonly page?: boolean;
  /**
   * Its block has no parent block: a page at the top of the notes. A block
   * placed before or after it has none either (move-blocks P2). Absent when
   * it has one.
   */
  readonly root?: boolean;
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
 * Why a task is blocked (GLOSSARY: 阻塞), one entry per cause. Every kind
 * says which task the blocking comes from and which tasks it waits for, so
 * the task panel shows any kind the same way (#54); later kinds (dependency,
 * sequential, cycle) are added to the union.
 *
 * - `subtasks` (子任务阻塞): direct subtasks neither done nor someday. Not
 *   passed down, so its source is always the task itself.
 * - `sequential` (顺序阻塞): under a sequential parent, earlier sibling
 *   subtasks neither done nor someday. `source` is the sibling held back:
 *   the task itself, or an ancestor task for blocking passed down (ADR
 *   0015); `waitingFor` are its earlier siblings.
 * - `cycle` (循环依赖): the task is on a dependency cycle (#60). `source` is
 *   the task itself; `waitingFor` are the tasks on the cycle it waits for
 *   directly, in note order.
 */
export type BlockingReason =
  | (BlockingReasonBase & {
      readonly kind: "subtasks" | "sequential" | "cycle";
    })
  | (BlockingReasonBase & {
      readonly kind: "dependencies";
      /**
       * The source's dependency mode (GLOSSARY: 依赖模式): in mode "any" it
       * waits for every one listed, and one of them done is enough (#58).
       */
      readonly mode: DependencyMode;
    });

interface BlockingReasonBase {
  /**
   * The task the blocking comes from: the task itself, or an ancestor task
   * for blocking passed down (ADR 0015).
   */
  readonly source: TaskId;
  /** The tasks it waits for, in note order. */
  readonly waitingFor: readonly TaskId[];
}

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
   * The nearest done ancestor task (GLOSSARY: 下一步行动): with one, at any
   * level, the whole branch below it is out of the next actions; `null` when
   * no ancestor task is done. The task itself does not count.
   */
  readonly doneAncestor: TaskId | null;
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

  /**
   * Under a sequential parent, the earlier sibling subtasks (note order) that
   * hold `item` back: neither done nor someday (GLOSSARY: 顺序执行). Empty
   * when its parent task is not sequential.
   */
  const earlierOpenSiblings = (item: SnapshotTask): TaskId[] => {
    const parent = item.parentId === null ? undefined : byId.get(item.parentId);
    if (!parent?.task.sequential) return [];
    return (children.get(parent.task.id) ?? [])
      .filter(
        (sibling) =>
          sibling.position < item.position && !releasesParent(sibling.task),
      )
      .map((sibling) => sibling.task.id);
  };

  /**
   * The dependencies of `item` not yet met (GLOSSARY: 依赖), in the order
   * the notes hold them. A dependency is met when its target is done; a
   * target that is not a task in the snapshot is a stale dependency and
   * counts as met. In mode "all" every dependency must be met; in mode "any"
   * (GLOSSARY: 依赖模式) one met dependency, stale ones included, is enough,
   * and none is listed then.
   */
  const unmetDependencies = (item: SnapshotTask): TaskId[] => {
    const unmet = item.task.dependencies.filter((target) => {
      const dependency = byId.get(target);
      return dependency !== undefined && dependency.task.status !== "done";
    });
    const someMet = unmet.length < item.task.dependencies.length;
    return item.task.dependencyMode === "any" && someMet ? [] : unmet;
  };

  const cycles = findDependencyCycles(snapshot);

  const entries = new Map<TaskId, TaskGraphEntry>();
  for (const item of ordered) {
    const blockedBy: BlockingReason[] = [];
    const waitingFor = (children.get(item.task.id) ?? [])
      .filter((child) => !releasesParent(child.task))
      .map((child) => child.task.id);
    if (waitingFor.length > 0) {
      blockedBy.push({ kind: "subtasks", source: item.task.id, waitingFor });
    }
    const chain = selfAndAncestors(item);
    // Dependency blocking of the task or any ancestor task passes down (ADR
    // 0015): one reason per link whose dependencies are unmet, nearest first.
    for (const link of chain) {
      const waitingFor = unmetDependencies(link);
      if (waitingFor.length > 0) {
        blockedBy.push({
          kind: "dependencies",
          source: link.task.id,
          waitingFor,
          mode: link.task.dependencyMode,
        });
      }
    }
    // Sequential blocking of the task or any ancestor task passes down (ADR
    // 0015): one reason per link held back, nearest first.
    for (const link of chain) {
      const waitingFor = earlierOpenSiblings(link);
      if (waitingFor.length > 0) {
        blockedBy.push({
          kind: "sequential",
          source: link.task.id,
          waitingFor,
        });
      }
    }
    const onCycle = cycles.get(item.task.id);
    if (onCycle) {
      blockedBy.push({
        kind: "cycle",
        source: item.task.id,
        waitingFor: onCycle,
      });
    }
    const parked = chain.some((link) => parks(link.task));
    const doneAncestor =
      chain.slice(1).find((link) => link.task.status === "done")?.task.id ??
      null;
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
      doneAncestor,
      effectiveStart,
      nextAction:
        (status === "todo" || status === "doing") &&
        blockedBy.length === 0 &&
        !parked &&
        doneAncestor === null &&
        started,
    });
  }

  const all = [...entries.values()];
  return {
    nextActions: all.filter((entry) => entry.nextAction),
    entry: (id) => entries.get(id),
  };
}
