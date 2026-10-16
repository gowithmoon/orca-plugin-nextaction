// Use case: read all tasks (GLOSSARY: 全部任务视图), for the all tasks view
// (#65): the task tree.
import {
  analyzeTaskGraph,
  type SnapshotProject,
  type SnapshotTask,
  type TaskGraph,
  type TaskGraphEntry,
  type TaskGraphSnapshot,
} from "../../domain/blocking/task-graph";
import {
  type ProjectProgress,
  unfinishedTaskCount,
} from "../../domain/project/progress";
import type { Project, ProjectId } from "../../domain/project/project";
import { projectScore, score } from "../../domain/scoring/score";
import type { CompletionEntry } from "../../domain/task/completion-history";
import type {
  CalendarDate,
  Task,
  TaskId,
  TaskStatus,
} from "../../domain/task/task";
import {
  filterChoosesAny,
  filterLets,
  type TaskFilter,
} from "../../domain/task/task-filter";
import { matchesSearch } from "../../domain/task/task-search";
import { addDays, compareDays } from "../../domain/time/calendar-days";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";
import {
  type ProjectNodeContext,
  projectNode,
  projectNodeContext,
} from "./project-nodes";

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

/**
 * A node in the tree, told apart by `kind`: a task, or a project (GLOSSARY:
 * 项目行), only ever top-level. Every consumer branches on it.
 */
export type AllTasksNode = TaskNode | ProjectNode;

/** What every kind of node has. */
interface TreeNode {
  /** Why it is faded; `null` when it is not. */
  readonly faded: FadeReason | null;
  /** The nodes below it in the tree, in note order. */
  readonly children: readonly AllTasksNode[];
}

/** A task in the tree (GLOSSARY: 任务卡片). */
export interface TaskNode extends TreeNode {
  readonly kind: "task";
  readonly task: Task;
  /**
   * Marked blocked (GLOSSARY: 阻塞): to do or in progress, and held back by a
   * dependency, a sequential parent or a dependency cycle, its own or passed
   * down from an ancestor task. Subtask blocking alone does not mark it: the
   * subtasks show right under it.
   */
  readonly blocked: boolean;
  /**
   * The project it belongs to (GLOSSARY: 所属项目), for its card, when where
   * it sits does not say so: not under that project's row, nor below a card
   * showing it already. `null`: none to show.
   */
  readonly shownProject: Project | null;
  /**
   * The text of its parent task (GLOSSARY: 父任务), for its card, when the
   * tree does not show it above: only a top-level task of a project scope
   * whose parent task is not the project's. `null`: none to show.
   */
  readonly parentText: string | null;
}

/**
 * A project in the tree (GLOSSARY: 项目行): the top-level tasks under its
 * block sit below it; a task that belongs to it by its own setting stays
 * where it sits. It is never faded in the tree (`faded` is `null`); in the
 * done section it stands for itself and its tasks. The review's projects
 * step fades a project kept there after it left the step (`faded` is
 * `"kept"`).
 */
export interface ProjectNode extends TreeNode {
  readonly kind: "project";
  readonly project: Project;
  /** Of every task that belongs to it (GLOSSARY: 进度). */
  readonly progress: ProjectProgress;
  /** GLOSSARY: 缺少下一步行动. */
  readonly noNextAction: boolean;
  /**
   * The logical days without progress (GLOSSARY: 长期无进展); `null`: it
   * is not without recent progress.
   */
  readonly noProgressDays: number | null;
  /** GLOSSARY: 逾期项目. */
  readonly overdue: boolean;
  /**
   * How many tasks that belong to it are not done; for a done project kept
   * in the tree, the N of "N tasks not done yet".
   */
  readonly unfinished: number;
  /** How many tasks belong to it, done or not. */
  readonly taskCount: number;
  /**
   * Its start lies ahead (GLOSSARY: 开始日期): later than today plus the
   * start preview days.
   */
  readonly notStarted: boolean;
}

/**
 * An item of the done section: a done subtree's top-level task, or a done
 * project with all its tasks done, standing for them (GLOSSARY: 已完成区).
 */
export type DoneItem =
  | {
      readonly kind: "task";
      readonly task: Task;
      /** The project it belongs to, for its card; `null`: none. */
      readonly shownProject: Project | null;
      /** As `TaskNode.parentText`. */
      readonly parentText: string | null;
    }
  | ProjectNode;

/** The done section (GLOSSARY: 已完成区), below the tree. */
export interface DoneSection {
  /**
   * One per done subtree or done project, the most recent last completion
   * (a project's: of the tasks under it) first, those with none recorded
   * after, in note order.
   */
  readonly items: readonly DoneItem[];
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
 * keep note order. A project row sorts with the top-level tasks by its own
 * values (for the score: effort 4, no ancestor factor), the tasks below it
 * in note order (#148).
 * - `note`: note order.
 * - `due`: the task's own due day, earliest first, none last.
 * - `start`: the task's own start, earliest first, none last.
 * - `importance`: highest first.
 * - `urgency`: the task's own urgency, highest first (#74).
 * - `score` (GLOSSARY: 评分): highest first, for a task of any status, from
 *   its effective start (ADR 0015).
 * - `captured`: when the block was created, newest first.
 */
export type AllTasksSort =
  | "note"
  | "due"
  | "start"
  | "importance"
  | "urgency"
  | "score"
  | "captured";

/**
 * Which way a sort runs: `ascending` is its own direction (earliest day,
 * highest importance, urgency or score, newest capture first), `descending` the
 * reverse.
 */
export type SortDirection = "ascending" | "descending";

/** A status a task not done can have: the ones the status filter offers. */
export type OpenStatus = Exclude<TaskStatus, "done">;

/**
 * The all tasks view's filter (#69): the next action view's contexts, labels,
 * importance and urgency (same rules), and statuses. Within a dimension any choice
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
   * Only the tasks whose text and search text together hold every word of it
   * (`matchesSearch`) are shown; empty: every one.
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

/**
 * Read with a project scope (`ReadAllTasksScopedOptions`), for the project
 * details (GLOSSARY: 项目视图):
 * - `project`: the project itself, as its project row would show it (progress,
 *   whether it lacks a next action, how many tasks are not done), for the
 *   attribute area; with it, as `AllTasksRead`, the tree of the tasks that
 *   belong to it (#157), wherever they sit: no project rows, its tasks whose
 *   parent task is not its as the roots, in note order, a root showing its
 *   parent task's text and no card the project. Filter, search, sort and
 *   the done section apply as unscoped; there a done project is no single
 *   item, its done roots are.
 * - `noProject`: the block is not a project, or the project tag is paused
 *   (#143): there is no such project to show.
 */
export type ProjectScopeRead =
  | (AllTasksRead & {
      readonly kind: "project";
      /** Without children. */
      readonly project: ProjectNode;
    })
  | { readonly kind: "noProject" };

export interface ReadAllTasksScopedOptions extends ReadAllTasksOptions {
  /** Only what belongs to this project (GLOSSARY: 所属项目). */
  readonly project: ProjectId;
}

/**
 * Reads all tasks, or with `project` only that project's. Errors are thrown
 * as they are.
 */
export interface ReadAllTasks {
  (
    options?: ReadAllTasksOptions & { readonly project?: undefined },
  ): Promise<AllTasksRead>;
  (options: ReadAllTasksScopedOptions): Promise<ProjectScopeRead>;
}

/**
 * Marked blocked as `TaskNode.blocked` says; shared with the project board
 * (#166).
 */
export function marksBlocked(entry: TaskGraphEntry | undefined): boolean {
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

/**
 * What a top-level node is sorted by: a task's own values, or a project's
 * (GLOSSARY: 项目行), each the project's own.
 */
export type Sorted = Pick<
  Task,
  "due" | "start" | "importance" | "urgency" | "created"
> & { readonly score: number };

/**
 * What task `task` is sorted by: its own values and its score (GLOSSARY:
 * 评分) on `today`, from its effective start. Shared with the project board.
 */
export function taskSorted(
  task: Task,
  graph: TaskGraph,
  today: CalendarDate,
): Sorted {
  const entry = graph.entry(task.id);
  return {
    ...task,
    score: score(
      {
        task,
        effectiveStart: entry?.effectiveStart ?? null,
        ancestorRatings: entry?.ancestorRatings ?? [],
      },
      today,
    ),
  };
}

/**
 * How items compare for `sort` run `direction`; `null` for note order. Only
 * the comparison flips, so ties still compare equal. Each item takes part
 * with its own values (`sortedOf`): a project row with the project's.
 * Shared with the project board's cards.
 */
export function comparator<N>(
  sort: AllTasksSort,
  direction: SortDirection,
  sortedOf: (node: N) => Sorted,
): ((a: N, b: N) => number) | null {
  type NodeOrder = (a: N, b: N) => number;
  const sign = direction === "descending" ? -1 : 1;
  const by =
    (compare: (a: Sorted, b: Sorted) => number): NodeOrder =>
    (a, b) =>
      compare(sortedOf(a), sortedOf(b));
  switch (sort) {
    case "note":
      return null;
    case "due":
      return by((a, b) => byDay(a.due, b.due, sign));
    case "start":
      return by((a, b) => byDay(a.start, b.start, sign));
    case "importance":
      return by((a, b) => sign * (b.importance - a.importance));
    case "urgency":
      return by((a, b) => sign * (b.urgency - a.urgency));
    case "score":
      return by((a, b) => sign * (b.score - a.score));
    case "captured":
      return by((a, b) => sign * (b.created.getTime() - a.created.getTime()));
  }
}

/** A top-level entry of the tree, before narrowing, in note order. */
type TopLevel =
  | { readonly kind: "task"; readonly item: SnapshotTask }
  | {
      readonly kind: "project";
      readonly item: SnapshotProject;
      /** The top-level tasks under its block, in note order. */
      readonly below: readonly SnapshotTask[];
    };

/** The tasks as a tree, in note order. */
export interface TaskTree {
  /** Top-level tasks not under a project block, and the projects. */
  readonly topLevel: readonly TopLevel[];
  /** The task's subtasks; none for a task without. */
  childrenOf(id: TaskId): readonly SnapshotTask[];
}

/**
 * The tasks that belong to `project` (GLOSSARY: 所属项目) as a tree, for a
 * project scope: no project rows; the roots are its tasks whose parent task
 * is not its, wherever they sit, in note order. Parent task first, every
 * descendant task of one of its tasks is its too, so a root keeps its whole
 * subtree.
 */
function scopedTaskTree(
  tree: TaskTree,
  snapshot: TaskGraphSnapshot,
  graph: TaskGraph,
  project: ProjectId,
): TaskTree {
  return {
    topLevel: projectRootTasks(snapshot, graph, project).map((item) => ({
      kind: "task",
      item,
    })),
    childrenOf: tree.childrenOf,
  };
}

/**
 * The project root tasks of `project` (GLOSSARY: 项目根任务): its tasks whose
 * parent task is not its, or that have none, wherever they sit, in note
 * order. Shared with the project board (#166).
 */
export function projectRootTasks(
  snapshot: TaskGraphSnapshot,
  graph: TaskGraph,
  project: ProjectId,
): SnapshotTask[] {
  const owned = (id: TaskId) => graph.entry(id)?.project?.id === project;
  return [...snapshot.tasks]
    .sort((a, b) => a.position - b.position)
    .filter(
      (item) =>
        owned(item.task.id) &&
        (item.parentId === null || !owned(item.parentId)),
    );
}

/** Shared with the project board (#165). */
export function buildTaskTree(snapshot: TaskGraphSnapshot): TaskTree {
  const ordered = [...snapshot.tasks].sort((a, b) => a.position - b.position);
  const ids = new Set(ordered.map((item) => item.task.id));
  const projects = new Map(
    (snapshot.projects ?? []).map((item) => [item.project.id, item]),
  );
  const children = new Map<TaskId, SnapshotTask[]>();
  const below = new Map<ProjectId, SnapshotTask[]>();
  const loose: SnapshotTask[] = [];
  for (const item of ordered) {
    // A parent missing from the snapshot leaves the task top-level.
    if (item.parentId === null || !ids.has(item.parentId)) {
      // A top-level task sits under the row of its nearest project block,
      // whatever project it belongs to: the tree is the notes' structure.
      const project =
        item.projectBlock === undefined
          ? undefined
          : projects.get(item.projectBlock);
      if (project) {
        const list = below.get(project.project.id) ?? [];
        list.push(item);
        below.set(project.project.id, list);
      } else loose.push(item);
      continue;
    }
    const siblings = children.get(item.parentId) ?? [];
    siblings.push(item);
    children.set(item.parentId, siblings);
  }
  const topLevel: { position: number; entry: TopLevel }[] = [
    ...loose.map((item) => ({
      position: item.position,
      entry: { kind: "task", item } as const,
    })),
    ...[...projects.values()].map((item) => ({
      position: item.position,
      entry: {
        kind: "project",
        item,
        below: below.get(item.project.id) ?? [],
      } as const,
    })),
  ];
  // Stable: a block both a task and a project shows its task first.
  topLevel.sort((a, b) => a.position - b.position);
  return {
    topLevel: topLevel.map(({ entry }) => entry),
    childrenOf: (id) => children.get(id) ?? [],
  };
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
  /** What project nodes read; its summaries are the projects' tasks. */
  readonly projects: ProjectNodeContext;
  /**
   * The project of a project scope: every card is its, so none shows it,
   * and a top-level task shows its parent task's text. `null`: no scope.
   */
  readonly scope: ProjectId | null;
}

/**
 * The parent task text a top-level task's card shows: in a project scope,
 * its parent task's, which the tree does not hold; `null` otherwise.
 */
function rootParentText(
  context: NodeContext,
  item: SnapshotTask,
): string | null {
  if (context.scope === null || item.parentId === null) return null;
  return context.graph.entry(item.parentId)?.task.text ?? null;
}

/** `top`, the node of top-level task `item`, with its parent task text. */
function asRoot(
  context: NodeContext,
  item: SnapshotTask,
  top: TaskNode,
): TaskNode {
  return { ...top, parentText: rootParentText(context, item) };
}

/**
 * The project is done and so is every task that belongs to it, and no task
 * under its row is left open: it goes to the done section with them. "Done"
 * is the task's own status, as for a done subtree (a done ancestor task does
 * not make the rest done here, only for progress).
 */
function projectFinished(
  context: NodeContext,
  entry: Extract<TopLevel, { kind: "project" }>,
): boolean {
  return (
    entry.item.project.status === "done" &&
    unfinishedTaskCount(
      context.projects.summaries.get(entry.item.project.id)?.tasks ?? [],
    ) === 0 &&
    !entry.below.some((item) => holdsOpen(context.tree, item))
  );
}

/**
 * The project the card of `item` shows: the one it belongs to, unless the
 * project row or a card above it says so already (`shown`); `null`: none.
 */
function shownProjectOf(
  context: NodeContext,
  item: SnapshotTask,
  shown: ProjectId | null,
): Project | null {
  const project = context.graph.entry(item.task.id)?.project ?? null;
  return project !== null && project.id !== shown ? project : null;
}

/** What the subtasks of a card showing `project` take as said already. */
function shownBelow(project: Project | null, shown: ProjectId | null) {
  return project?.id ?? shown;
}

/**
 * The node of `item` and its whole subtree; `shown`: the project the
 * project row or a card above it says already.
 */
function node(
  context: NodeContext,
  item: SnapshotTask,
  shown: ProjectId | null,
): TaskNode {
  const shownProject = shownProjectOf(context, item, shown);
  const below = shownBelow(shownProject, shown);
  return {
    kind: "task",
    task: item.task,
    faded: item.task.status === "done" ? "done" : null,
    blocked: marksBlocked(context.graph.entry(item.task.id)),
    shownProject,
    parentText: null,
    children: context.tree
      .childrenOf(item.task.id)
      .map((child) => node(context, child, below)),
  };
}

/**
 * The kept task with only its ancestor tasks above it, for where it sits;
 * `undefined` when the subtree of `item` does not hold it.
 */
function keptPath(
  context: NodeContext,
  item: SnapshotTask,
  shown: ProjectId | null,
): TaskNode | undefined {
  if (item.task.id === context.keep) {
    return { ...node(context, item, shown), faded: "kept", children: [] };
  }
  const own = node(context, item, shown);
  const next = shownBelow(own.shownProject, shown);
  for (const child of context.tree.childrenOf(item.task.id)) {
    const below = keptPath(context, child, next);
    if (below) return { ...own, children: [below] };
  }
  return undefined;
}

/**
 * What the filter and the search text let through. Shared with the project
 * board (#172), which narrows by the same rules.
 */
export interface Narrowing {
  readonly filter: AllTasksFilter;
  /** What is searched for, as typed; empty: no search. */
  readonly search: string;
}

export function narrowing(options: {
  readonly filter?: AllTasksFilter;
  readonly search?: string;
}): Narrowing {
  return { filter: options.filter ?? {}, search: options.search ?? "" };
}

/** Something is searched for: not only white space. */
export function searches(narrow: Narrowing): boolean {
  return narrow.search.trim() !== "";
}

/** The filter or the search lets fewer through than every task. */
export function narrows(narrow: Narrowing): boolean {
  return (
    searches(narrow) ||
    filterChoosesAny(narrow.filter) ||
    (narrow.filter.statuses?.length ?? 0) > 0
  );
}

/** The task is found by what is searched for (#112). */
function found(narrow: Narrowing, task: Task): boolean {
  return matchesSearch(narrow.search, task);
}

/** Something is searched for, and the project's name holds it. */
function projectFound(narrow: Narrowing, project: Project): boolean {
  return (
    searches(narrow) &&
    matchesSearch(narrow.search, { text: project.text, searchText: "" })
  );
}

/**
 * The task is let through in the tree. `byStatus: false` leaves the status
 * filter out (the done section; the board by status, whose columns it
 * chooses instead, #172).
 */
export function matches(
  narrow: Narrowing,
  task: Task,
  byStatus = true,
): boolean {
  const statuses = byStatus ? (narrow.filter.statuses ?? []) : [];
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
  shown: ProjectId | null,
): TaskNode | undefined {
  // An ancestor task shown only for where a task sits still shows the
  // project, so the tasks below it do not repeat it.
  const own = node(context, item, shown);
  const next = shownBelow(own.shownProject, shown);
  const below = context.tree
    .childrenOf(item.task.id)
    .flatMap((child) => shownNode(context, narrow, child, counted, next) ?? []);
  if (matches(narrow, item.task)) {
    counted.matches += 1;
    return { ...own, children: below };
  }
  // The kept task no longer let through stays in its place, not counted.
  if (item.task.id === context.keep)
    return { ...own, faded: "kept", children: below };
  if (below.length === 0) return undefined;
  return { ...own, faded: "ancestor", children: below };
}

/** A done section item before its range, with the completion it is ordered by. */
interface DoneEntry {
  readonly item: DoneItem;
  readonly lastCompletion: CompletionEntry | undefined;
}

/**
 * The tree in note order with only what is let through, how many tasks of
 * it are, and the done section's items before its range, in note order.
 */
function narrowedTree(
  context: NodeContext,
  narrow: Narrowing,
): { tree: AllTasksNode[]; matchCount: number; done: DoneEntry[] } {
  // A top-level task done with all its descendant tasks belongs to the done
  // section (GLOSSARY: 已完成区); every other task stays in its place. Only a
  // task still in the snapshot is kept: a block no longer a task is not.
  const counted = { matches: 0 };
  const tree: AllTasksNode[] = [];
  const done: DoneEntry[] = [];
  /** The status filter does not apply to the done section. */
  const doneLets = (task: Task) => matches(narrow, task, false);
  for (const entry of context.tree.topLevel) {
    if (entry.kind === "project") {
      const project = entry.item.project;
      if (!projectFinished(context, entry)) {
        // Found by its name, every task under the row is found; the filter
        // still applies to them.
        const below = projectFound(narrow, project)
          ? { ...narrow, search: "" }
          : narrow;
        // Under an open project row a done subtree stays faded in its
        // place, as a done subtask does under a task.
        const children = entry.below.flatMap(
          (item) => shownNode(context, below, item, counted, project.id) ?? [],
        );
        // Narrowed, a row with no task let through below it is hidden.
        if (children.length > 0 || !narrows(narrow))
          tree.push(projectNode(context.projects, project, children));
        continue;
      }
      // A finished project holding the kept task stays in the tree for it.
      const kept = entry.below.flatMap(
        (item) => keptPath(context, item, project.id) ?? [],
      );
      if (kept.length > 0) {
        tree.push(projectNode(context.projects, project, kept));
        continue;
      }
      // Its tasks let through as the top-level tasks of done subtrees are,
      // every one found when its name is; one without any, only while
      // nothing but its name narrows.
      const named = projectFound(narrow, project);
      if (
        entry.below.length === 0
          ? (named || !searches(narrow)) && !filterChoosesAny(narrow.filter)
          : entry.below.some(
              (item) =>
                filterLets(narrow.filter, item.task) &&
                (named || found(narrow, item.task)),
            )
      ) {
        done.push({
          item: projectNode(context.projects, project, []),
          lastCompletion: context.projects.summaries.get(project.id)
            ?.lastCompletion,
        });
      }
      continue;
    }
    const item = entry.item;
    // In a project scope the scope's project goes without saying.
    const scopeProject = context.scope;
    if (holdsOpen(context.tree, item)) {
      const shown = shownNode(context, narrow, item, counted, scopeProject);
      if (shown) tree.push(asRoot(context, item, shown));
      continue;
    }
    // A done subtree holding the kept task stays in the tree for it, so it
    // is not in the done section too; the other dimensions and the search
    // look at the item's own top-level task.
    const kept = keptPath(context, item, scopeProject);
    if (kept) tree.push(asRoot(context, item, kept));
    else if (doneLets(item.task))
      done.push({
        item: {
          kind: "task",
          task: item.task,
          shownProject: shownProjectOf(context, item, scopeProject),
          parentText: rootParentText(context, item),
        },
        lastCompletion: item.lastCompletion,
      });
  }
  return { tree, matchCount: counted.matches, done };
}

/**
 * The done section over `done` (in note order): by default only the last
 * `doneSectionDays` logical days; `everyDay` lifts the range.
 */
function doneSection(
  done: readonly DoneEntry[],
  today: CalendarDate,
  everyDay: boolean,
): DoneSection {
  const { recent, earlier } = byLastCompletion(
    done,
    (entry) => entry.lastCompletion,
    today,
    everyDay,
  );
  return {
    items: recent.map((entry) => entry.item),
    count: recent.length,
    hasEarlier: earlier.length > 0,
  };
}

/**
 * Done items (in note order) split by the done section's range (#63): those
 * last completed within the last `doneSectionDays` logical days, and the
 * earlier ones. Each part has the most recent last completion first, those
 * with none after, in note order. A task with no completion recorded (e.g.
 * made done in Orca directly) has no reliable time, so it is never among the
 * recent ones. `everyDay`: every item is recent. Shared with the project
 * board's done column (#166).
 */
export function byLastCompletion<T>(
  done: readonly T[],
  lastCompletionOf: (item: T) => CompletionEntry | undefined,
  today: CalendarDate,
  everyDay = false,
): { recent: T[]; earlier: T[] } {
  const firstDay = addDays(today, 1 - doneSectionDays);
  const isRecent = (item: T) => {
    if (everyDay) return true;
    const last = lastCompletionOf(item);
    return last !== undefined && compareDays(last.day, firstDay) >= 0;
  };
  // Stable, and `done` is in note order: ties keep it.
  const time = (item: T) =>
    lastCompletionOf(item)?.at.getTime() ?? Number.NEGATIVE_INFINITY;
  const ordered = [...done].sort((a, b) =>
    time(a) === time(b) ? 0 : time(b) - time(a),
  );
  return {
    recent: ordered.filter(isRecent),
    earlier: ordered.filter((item) => !isRecent(item)),
  };
}

export function createReadAllTasks(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}): ReadAllTasks {
  function readAllTasks(
    options?: ReadAllTasksOptions & { readonly project?: undefined },
  ): Promise<AllTasksRead>;
  function readAllTasks(
    options: ReadAllTasksScopedOptions,
  ): Promise<ProjectScopeRead>;
  async function readAllTasks(
    options: ReadAllTasksOptions & { readonly project?: ProjectId } = {},
  ): Promise<AllTasksRead | ProjectScopeRead> {
    const snapshot = await deps.repository.readTaskGraph();
    const boundary = deps.dayBoundary.current();
    const today = logicalDay(deps.clock.now(), boundary);
    const previewDays = deps.startPreviewDays.current();
    const graph = analyzeTaskGraph(snapshot, { today, previewDays });
    const context: NodeContext = {
      tree: buildTaskTree(snapshot),
      graph,
      keep: options.keep,
      projects: projectNodeContext(snapshot, graph, {
        today,
        previewDays,
        boundary,
      }),
      scope: null,
    };
    const scoped =
      options.project === undefined
        ? undefined
        : (snapshot.projects ?? []).find(
            (item) => item.project.id === options.project,
          );
    if (options.project !== undefined && !scoped) return { kind: "noProject" };
    const narrow = narrowing(options);
    const { tree, matchCount, done } = narrowedTree(
      scoped
        ? {
            ...context,
            scope: scoped.project.id,
            tree: scopedTaskTree(
              context.tree,
              snapshot,
              graph,
              scoped.project.id,
            ),
          }
        : context,
      narrow,
    );
    const sortedOf = (node: AllTasksNode): Sorted =>
      node.kind === "task"
        ? taskSorted(node.task, graph, today)
        : { ...node.project, score: projectScore(node.project, today) };
    const compare = comparator(
      options.sort ?? "note",
      options.direction ?? "ascending",
      sortedOf,
    );
    // Stable: ties keep note order.
    if (compare) tree.sort(compare);
    // Showing earlier items or searching lifts the done section's range.
    const everyDay = options.showEarlierDone === true || searches(narrow);
    const read = { tree, matchCount, done: doneSection(done, today, everyDay) };
    if (!scoped) return read;
    return {
      kind: "project",
      project: projectNode(context.projects, scoped.project, []),
      ...read,
    };
  }
  return readAllTasks;
}
