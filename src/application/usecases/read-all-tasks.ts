// Use case: read all tasks (GLOSSARY: 全部任务视图), for the all tasks view
// (#65): the task tree.
import {
  analyzeTaskGraph,
  type SnapshotTask,
  type TaskGraphEntry,
} from "../../domain/blocking/task-graph";
import { score } from "../../domain/scoring/score";
import type {
  CalendarDate,
  Task,
  TaskId,
  TaskStatus,
} from "../../domain/task/task";
import { filterLets, type TaskFilter } from "../../domain/task/task-filter";
import { addDays, compareDays } from "../../domain/time/calendar-days";
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
 * - `ancestor`: an ancestor task the filter or search does not let through,
 *   shown only for where a task below it sits.
 */
export type FadeReason = "done" | "kept" | "ancestor";

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

/** The done section (GLOSSARY: 已完成区), below the tree. */
export interface DoneSection {
  /**
   * One per done subtree: its top-level task, the most recent last
   * completion first, those with none recorded after, in note order.
   */
  readonly items: readonly Task[];
  /** How many items the current range lists (the N of its title). */
  readonly count: number;
  /** Items are left out for being earlier: "show earlier" has some to show. */
  readonly hasEarlier: boolean;
}

export interface AllTasksRead {
  /** The top-level nodes, ordered as asked (`sort`). */
  readonly tree: readonly AllTasksNode[];
  /**
   * How many tasks in the tree the filter and search let through (the count
   * shown while filtering): not the ancestor tasks shown only for where a
   * task sits, not the kept task, not the done section.
   */
  readonly matchCount: number;
  readonly done: DoneSection;
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

/** A status a task not done can have: the ones the status filter offers. */
export type OpenStatus = Exclude<TaskStatus, "done">;

/**
 * The all tasks view's filter (#69): the next action view's contexts, labels
 * and importance (same rules), and statuses. Within a dimension any choice
 * is enough ("or"); every dimension given must let the task through ("and").
 */
export interface AllTasksFilter extends TaskFilter {
  /** The statuses let through; only the tree is filtered by them. */
  readonly statuses?: readonly OpenStatus[];
}

export interface ReadAllTasksOptions {
  /** Defaults to `note`. */
  readonly sort?: AllTasksSort;
  /** Only the tasks it lets through are shown; none: every one. */
  readonly filter?: AllTasksFilter;
  /**
   * Only the tasks whose text holds every word of it (split on white space),
   * whatever the case, are shown; empty: every one.
   */
  readonly search?: string;
  /**
   * A task kept in the tree after it would have left it (the one being
   * viewed, as in the other views), in its place.
   */
  readonly keep?: TaskId;
  /**
   * The done section lists every item, not only those of the last
   * `doneSectionDays` logical days ("show earlier").
   */
  readonly showEarlierDone?: boolean;
}

/**
 * How many logical days back, today included, the done section lists by
 * default (#63).
 */
export const doneSectionDays = 30;

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
    const filter = options.filter ?? {};
    const statuses = filter.statuses ?? [];
    const words = (options.search ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word !== "");
    /** The task's text holds every word searched for. */
    const found = (task: Task): boolean => {
      const text = task.text.toLowerCase();
      return words.every((word) => text.includes(word));
    };
    /** The task is let through in the tree. */
    const matches = (task: Task): boolean =>
      (statuses.length === 0 ||
        (task.status !== "done" && statuses.includes(task.status))) &&
      filterLets(filter, task) &&
      found(task);
    /**
     * The node of `item` with only what is let through, and the ancestor
     * tasks of that for where it sits; `undefined`: nothing in its subtree.
     */
    let matchCount = 0;
    const shown = (item: SnapshotTask): AllTasksNode | undefined => {
      const below = (children.get(item.task.id) ?? []).flatMap(
        (child) => shown(child) ?? [],
      );
      if (matches(item.task)) {
        matchCount += 1;
        return { ...node(item), children: below };
      }
      // The kept task no longer let through stays in its place, not counted.
      if (item.task.id === options.keep)
        return { ...node(item), faded: "kept", children: below };
      if (below.length === 0) return undefined;
      return { ...node(item), faded: "ancestor", children: below };
    };
    const tree: AllTasksNode[] = [];
    const done: SnapshotTask[] = [];
    for (const item of topLevel) {
      if (holdsOpen(item)) {
        const filtered = shown(item);
        if (filtered) tree.push(filtered);
        continue;
      }
      // A done subtree holding the kept task stays in the tree for it, so it
      // is not in the done section too.
      const kept = keptPath(item);
      if (kept) tree.push(kept);
      // The status filter does not apply to the done section; the other
      // dimensions and the search look at the item's own top-level task.
      else if (filterLets(filter, item.task) && found(item.task))
        done.push(item);
    }
    const scoreOf = (task: Task) =>
      score(
        { task, effectiveStart: graph.entry(task.id)?.effectiveStart ?? null },
        today,
      );
    const compare = comparator(options.sort ?? "note", scoreOf);
    // Stable: ties keep note order.
    if (compare) tree.sort(compare);
    // By default only the last `doneSectionDays` logical days; showing earlier
    // ones or searching lifts the range. A task with no completion recorded
    // (e.g. made done in Orca directly) has no reliable time, so it is never
    // among them.
    const firstDay = addDays(today, 1 - doneSectionDays);
    const everyDay = options.showEarlierDone || words.length > 0;
    const listed = done.filter(
      (item) =>
        everyDay ||
        (item.lastCompletion !== undefined &&
          compareDays(item.lastCompletion.day, firstDay) >= 0),
    );
    // The most recent last completion first; those with none after, in note
    // order (`done` is in note order already, and the sort is stable).
    const time = (item: SnapshotTask) =>
      item.lastCompletion?.at.getTime() ?? Number.NEGATIVE_INFINITY;
    listed.sort((a, b) => (time(a) === time(b) ? 0 : time(b) - time(a)));
    return {
      tree,
      matchCount,
      done: {
        items: listed.map((item) => item.task),
        count: listed.length,
        hasEarlier: listed.length < done.length,
      },
    };
  };
}
