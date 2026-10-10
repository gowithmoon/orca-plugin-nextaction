// Use case: read all tasks (GLOSSARY: 全部任务视图), for the all tasks view
// (#65): the task tree.
import {
  analyzeTaskGraph,
  type SnapshotTask,
  type TaskGraphEntry,
} from "../../domain/blocking/task-graph";
import type { Task, TaskId } from "../../domain/task/task";
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
  /** The top-level nodes, in note order. */
  readonly tree: readonly AllTasksNode[];
}

export interface ReadAllTasksOptions {
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

export function createReadAllTasks(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}): ReadAllTasks {
  return async (options = {}) => {
    const snapshot = await deps.repository.readTaskGraph();
    const graph = analyzeTaskGraph(snapshot, {
      today: logicalDay(deps.clock.now(), deps.dayBoundary.current()),
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
    return { tree };
  };
}
