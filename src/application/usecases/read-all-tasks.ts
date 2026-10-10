// Use case: read all tasks (GLOSSARY: 全部任务视图), for the all tasks view
// (#65): the task tree.
import {
  analyzeTaskGraph,
  type SnapshotTask,
  type TaskGraph,
  type TaskGraphEntry,
  type TaskGraphSnapshot,
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
 * How the top-level nodes are ordered; subtasks always keep note order. Each
 * runs in the direction below unless reversed (`SortDirection`), and ties
 * keep note order.
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

/**
 * Which way a sort runs: `ascending` is its own direction (earliest day,
 * highest importance or score, newest capture first), `descending` the
 * reverse.
 */
export type SortDirection = "ascending" | "descending";

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
  /**
   * `descending` reverses the sort's own direction (see `AllTasksSort`); a
   * task without the day sorted by still comes last, and ties still keep
   * note order. Ignored for `note`. Defaults to `ascending`.
   */
  readonly direction?: SortDirection;
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

/** The earlier day first (`sign` -1: the later); none last either way. */
function byDay(
  a: CalendarDate | null,
  b: CalendarDate | null,
  sign: number,
): number {
  if (a === null || b === null)
    return (a === null ? 1 : 0) - (b === null ? 1 : 0);
  return sign * compareDays(a, b);
}

type NodeOrder = (a: AllTasksNode, b: AllTasksNode) => number;

/**
 * How top-level nodes compare for `sort` run `direction`; `null` for note
 * order. Only the comparison flips, so ties still compare equal.
 */
function comparator(
  sort: AllTasksSort,
  direction: SortDirection,
  scoreOf: (task: Task) => number,
): NodeOrder | null {
  const sign = direction === "descending" ? -1 : 1;
  switch (sort) {
    case "note":
      return null;
    case "due":
      return (a, b) => byDay(a.task.due, b.task.due, sign);
    case "start":
      return (a, b) => byDay(a.task.start, b.task.start, sign);
    case "importance":
      return (a, b) => sign * (b.task.importance - a.task.importance);
    case "score":
      return (a, b) => sign * (scoreOf(b.task) - scoreOf(a.task));
    case "captured":
      return (a, b) =>
        sign * (b.task.created.getTime() - a.task.created.getTime());
  }
}

/** The tasks as a tree, in note order. */
interface TaskTree {
  readonly topLevel: readonly SnapshotTask[];
  /** The task's subtasks; none for a task without. */
  childrenOf(id: TaskId): readonly SnapshotTask[];
}

function buildTaskTree(snapshot: TaskGraphSnapshot): TaskTree {
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
  return { topLevel, childrenOf: (id) => children.get(id) ?? [] };
}

/** Some task in the subtree of `item`, itself included, is not done. */
function holdsOpen(tree: TaskTree, item: SnapshotTask): boolean {
  return (
    item.task.status !== "done" ||
    tree.childrenOf(item.task.id).some((child) => holdsOpen(tree, child))
  );
}

/** What turning snapshot tasks into nodes needs. */
interface NodeContext {
  readonly tree: TaskTree;
  readonly graph: TaskGraph;
  readonly keep: TaskId | undefined;
}

function node(context: NodeContext, item: SnapshotTask): AllTasksNode {
  return {
    task: item.task,
    faded: item.task.status === "done" ? "done" : null,
    blocked: marksBlocked(context.graph.entry(item.task.id)),
    children: context.tree
      .childrenOf(item.task.id)
      .map((child) => node(context, child)),
  };
}

/**
 * The kept task with only its ancestor tasks above it, for where it sits;
 * `undefined` when the subtree of `item` does not hold it.
 */
function keptPath(
  context: NodeContext,
  item: SnapshotTask,
): AllTasksNode | undefined {
  if (item.task.id === context.keep) {
    return { ...node(context, item), faded: "kept", children: [] };
  }
  for (const child of context.tree.childrenOf(item.task.id)) {
    const below = keptPath(context, child);
    if (below) return { ...node(context, item), children: [below] };
  }
  return undefined;
}

/** What the filter and the search text let through. */
interface Narrowing {
  readonly filter: AllTasksFilter;
  /** The words searched for, in lower case; none: no search. */
  readonly words: readonly string[];
}

function narrowing(options: ReadAllTasksOptions): Narrowing {
  return {
    filter: options.filter ?? {},
    words: (options.search ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word !== ""),
  };
}

/** The task's text holds every word searched for. */
function found(narrow: Narrowing, task: Task): boolean {
  const text = task.text.toLowerCase();
  return narrow.words.every((word) => text.includes(word));
}

/** The task is let through in the tree. */
function matches(narrow: Narrowing, task: Task): boolean {
  const statuses = narrow.filter.statuses ?? [];
  return (
    (statuses.length === 0 ||
      (task.status !== "done" && statuses.includes(task.status))) &&
    filterLets(narrow.filter, task) &&
    found(narrow, task)
  );
}

/**
 * The node of `item` with only what is let through, and the ancestor tasks
 * of that for where it sits; `undefined`: nothing in its subtree. Adds the
 * tasks let through to `counted`.
 */
function shownNode(
  context: NodeContext,
  narrow: Narrowing,
  item: SnapshotTask,
  counted: { matches: number },
): AllTasksNode | undefined {
  const below = context.tree
    .childrenOf(item.task.id)
    .flatMap((child) => shownNode(context, narrow, child, counted) ?? []);
  if (matches(narrow, item.task)) {
    counted.matches += 1;
    return { ...node(context, item), children: below };
  }
  // The kept task no longer let through stays in its place, not counted.
  if (item.task.id === context.keep)
    return { ...node(context, item), faded: "kept", children: below };
  if (below.length === 0) return undefined;
  return { ...node(context, item), faded: "ancestor", children: below };
}

/**
 * The tree in note order with only what is let through, how many tasks of
 * it are, and the done section's items before its range, in note order.
 */
function narrowedTree(
  context: NodeContext,
  narrow: Narrowing,
): { tree: AllTasksNode[]; matchCount: number; done: SnapshotTask[] } {
  // A top-level task done with all its descendant tasks belongs to the done
  // section (GLOSSARY: 已完成区); every other task stays in its place. Only a
  // task still in the snapshot is kept: a block no longer a task is not.
  const counted = { matches: 0 };
  const tree: AllTasksNode[] = [];
  const done: SnapshotTask[] = [];
  for (const item of context.tree.topLevel) {
    if (holdsOpen(context.tree, item)) {
      const filtered = shownNode(context, narrow, item, counted);
      if (filtered) tree.push(filtered);
      continue;
    }
    // A done subtree holding the kept task stays in the tree for it, so it
    // is not in the done section too.
    const kept = keptPath(context, item);
    if (kept) tree.push(kept);
    // The status filter does not apply to the done section; the other
    // dimensions and the search look at the item's own top-level task.
    else if (filterLets(narrow.filter, item.task) && found(narrow, item.task))
      done.push(item);
  }
  return { tree, matchCount: counted.matches, done };
}

/**
 * The done section over `done` (in note order): by default only the last
 * `doneSectionDays` logical days; `everyDay` lifts the range.
 */
function doneSection(
  done: readonly SnapshotTask[],
  today: CalendarDate,
  everyDay: boolean,
): DoneSection {
  // A task with no completion recorded (e.g. made done in Orca directly) has
  // no reliable time, so it is never among the recent ones.
  const firstDay = addDays(today, 1 - doneSectionDays);
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
    items: listed.map((item) => item.task),
    count: listed.length,
    hasEarlier: listed.length < done.length,
  };
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
    const context: NodeContext = {
      tree: buildTaskTree(snapshot),
      graph,
      keep: options.keep,
    };
    const narrow = narrowing(options);
    const { tree, matchCount, done } = narrowedTree(context, narrow);
    const scoreOf = (task: Task) => {
      const entry = graph.entry(task.id);
      return score(
        {
          task,
          effectiveStart: entry?.effectiveStart ?? null,
          ancestorRatings: entry?.ancestorRatings ?? [],
        },
        today,
      );
    };
    const compare = comparator(
      options.sort ?? "note",
      options.direction ?? "ascending",
      scoreOf,
    );
    // Stable: ties keep note order.
    if (compare) tree.sort(compare);
    // Showing earlier items or searching lifts the done section's range.
    const everyDay =
      options.showEarlierDone === true || narrow.words.length > 0;
    return { tree, matchCount, done: doneSection(done, today, everyDay) };
  };
}
