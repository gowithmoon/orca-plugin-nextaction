// Use case: read all tasks (GLOSSARY: 全部任务视图), for the all tasks view
// (#65): the task tree.
import {
  analyzeTaskGraph,
  type SnapshotTask,
  type TaskGraphEntry,
} from "../../domain/blocking/task-graph";
import { score } from "../../domain/scoring/score";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import { compareDays } from "../../domain/time/calendar-days";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";

/**
 * Why a node is faded:
 * - `done`: a done task kept in the tree for where it sits (a done subtask
 *   of a task not done, or a done task holding one).
 * - `kept`: the task given as `keep`, which the tree would otherwise not
 *   hold, in its place.
 */
export type FadeReason = "done" | "kept";

/** A task in the tree. */
export interface AllTasksNode {
  readonly task: Task;
  /** Why it is faded; `null` when it is not. */
  readonly faded: FadeReason | null;
  /**
   * Marked blocked (GLOSSARY: 阻塞): to do or in progress, and held back by a
   * dependency, a sequential parent or a dependency cycle, its own or passed
   * down from an ancestor task. Subtask blocking alone does not mark it: the
   * subtasks show right under it.
   */
  readonly blocked: boolean;
  /** Its subtasks in the tree, in note order. */
  readonly children: readonly AllTasksNode[];
}

export interface AllTasksRead {
  /** The top-level nodes, ordered as asked (`sort`). */
  readonly tree: readonly AllTasksNode[];
}

/**
 * How the top-level nodes are ordered; subtasks always keep note order. The
 * direction is fixed, and ties keep note order.
 * - `note`: note order.
 * - `due`: the task's own due day, earliest first, none last.
 * - `start`: the task's own start, earliest first, none last.
 * - `importance`: highest first.
 * - `score` (GLOSSARY: 评分): highest first, for a task of any status, from
 *   its effective start (ADR 0015).
 * - `captured`: when the block was created, newest first.
 */
export type AllTasksSort =
  | "note"
  | "due"
  | "start"
  | "importance"
  | "score"
  | "captured";

export interface ReadAllTasksOptions {
  /** Defaults to `note`. */
  readonly sort?: AllTasksSort;
  /**
   * A task kept in the tree after it would have left it (the one being
   * viewed, as in the other views), in its place.
   */
  readonly keep?: TaskId;
}

/** Reads all tasks. Errors are thrown as they are. */
export type ReadAllTasks = (
  options?: ReadAllTasksOptions,
) => Promise<AllTasksRead>;

function marksBlocked(entry: TaskGraphEntry | undefined): boolean {
  if (!entry) return false;
  const status = entry.task.status;
  if (status !== "todo" && status !== "doing") return false;
  return entry.blockedBy.some((reason) => reason.kind !== "subtasks");
}

/** The earlier day first; none last. */
function byDay(a: CalendarDate | null, b: CalendarDate | null): number {
  if (a === null || b === null)
    return (a === null ? 1 : 0) - (b === null ? 1 : 0);
  return compareDays(a, b);
}

type NodeOrder = (a: AllTasksNode, b: AllTasksNode) => number;

/** How top-level nodes compare for `sort`; `null` for note order. */
function comparator(
  sort: AllTasksSort,
  scoreOf: (task: Task) => number,
): NodeOrder | null {
  switch (sort) {
    case "note":
      return null;
    case "due":
      return (a, b) => byDay(a.task.due, b.task.due);
    case "start":
      return (a, b) => byDay(a.task.start, b.task.start);
    case "importance":
      return (a, b) => b.task.importance - a.task.importance;
    case "score":
      return (a, b) => scoreOf(b.task) - scoreOf(a.task);
    case "captured":
      return (a, b) => b.task.created.getTime() - a.task.created.getTime();
  }
}

export function createReadAllTasks(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}): ReadAllTasks {
  return async (options = {}) => {
    const snapshot = await deps.repository.readTaskGraph();
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const graph = analyzeTaskGraph(snapshot, {
      today,
      previewDays: deps.startPreviewDays.current(),
    });
    const ordered = [...snapshot.tasks].sort((a, b) => a.position - b.position);
    const ids = new Set(ordered.map((item) => item.task.id));
    const children = new Map<TaskId, SnapshotTask[]>();
    const topLevel: SnapshotTask[] = [];
    for (const item of ordered) {
      // A parent missing from the snapshot leaves the task top-level.
      if (item.parentId === null || !ids.has(item.parentId)) {
        topLevel.push(item);
        continue;
      }
      const siblings = children.get(item.parentId) ?? [];
      siblings.push(item);
      children.set(item.parentId, siblings);
    }
    /** Some task in the subtree of `item`, itself included, is not done. */
    const holdsOpen = (item: SnapshotTask): boolean =>
      item.task.status !== "done" ||
      (children.get(item.task.id) ?? []).some(holdsOpen);
    const node = (item: SnapshotTask): AllTasksNode => ({
      task: item.task,
      faded: item.task.status === "done" ? "done" : null,
      blocked: marksBlocked(graph.entry(item.task.id)),
      children: (children.get(item.task.id) ?? []).map(node),
    });
    /**
     * The kept task with only its ancestor tasks above it, for where it
     * sits; `undefined` when the subtree of `item` does not hold it.
     */
    const keptPath = (item: SnapshotTask): AllTasksNode | undefined => {
      if (item.task.id === options.keep) {
        return { ...node(item), faded: "kept", children: [] };
      }
      for (const child of children.get(item.task.id) ?? []) {
        const below = keptPath(child);
        if (below) return { ...node(item), children: [below] };
      }
      return undefined;
    };
    // A top-level task done with all its descendant tasks belongs to the done
    // section (GLOSSARY: 已完成区); every other task stays in its place. Only a
    // task still in the snapshot is kept: a block no longer a task is not.
    const tree: AllTasksNode[] = [];
    for (const item of topLevel) {
      const shown = holdsOpen(item) ? node(item) : keptPath(item);
      if (shown) tree.push(shown);
    }
    const scoreOf = (task: Task) =>
      score(
        { task, effectiveStart: graph.entry(task.id)?.effectiveStart ?? null },
        today,
      );
    const compare = comparator(options.sort ?? "note", scoreOf);
    // Stable: ties keep note order.
    if (compare) tree.sort(compare);
    return { tree };
  };
}
