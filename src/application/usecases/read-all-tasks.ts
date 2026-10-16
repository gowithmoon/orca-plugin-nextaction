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
  lacksNextAction,
  type ProjectProgress,
  type ProjectTask,
  projectProgress,
  unfinishedTaskCount,
} from "../../domain/project/progress";
import type { Project, ProjectId } from "../../domain/project/project";
import { recurs } from "../../domain/recurrence/recurrence";
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
}

/**
 * A project in the tree (GLOSSARY: 项目行): the top-level tasks under its
 * block sit below it; a task that belongs to it by its own setting stays
 * where it sits. It is never faded in the tree (`faded` is `null`); in the
 * done section it stands for itself and its tasks.
 */
export interface ProjectNode extends TreeNode {
  readonly kind: "project";
  readonly project: Project;
  /** Of every task that belongs to it (GLOSSARY: 进度). */
  readonly progress: ProjectProgress;
  /** GLOSSARY: 缺少下一步行动. */
  readonly noNextAction: boolean;
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
 *   attribute area. The tree of its tasks and their done section join it
 *   later (#157), under the names `AllTasksRead` uses.
 * - `noProject`: the block is not a project, or the project tag is paused
 *   (#143): there is no such project to show.
 */
export type ProjectScopeRead =
  | {
      readonly kind: "project";
      /** Without children. */
      readonly project: ProjectNode;
    }
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
 * What a top-level node is sorted by: a task's own values, or a project's
 * (GLOSSARY: 项目行), each the project's own.
 */
type Sorted = Pick<
  Task,
  "due" | "start" | "importance" | "urgency" | "created"
> & { readonly score: number };

/**
 * How top-level nodes compare for `sort` run `direction`; `null` for note
 * order. Only the comparison flips, so ties still compare equal. A project
 * row takes part with its own values (`sortedOf`).
 */
function comparator(
  sort: AllTasksSort,
  direction: SortDirection,
  sortedOf: (node: AllTasksNode) => Sorted,
): NodeOrder | null {
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
interface TaskTree {
  /** Top-level tasks not under a project block, and the projects. */
  readonly topLevel: readonly TopLevel[];
  /** The task's subtasks; none for a task without. */
  childrenOf(id: TaskId): readonly SnapshotTask[];
}

function buildTaskTree(snapshot: TaskGraphSnapshot): TaskTree {
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

/** What the tasks that belong to a project say about it. */
interface ProjectSummary {
  readonly tasks: readonly ProjectTask[];
  /** The latest last completion among them; absent for none recorded. */
  readonly lastCompletion?: CompletionEntry;
}

/**
 * The tasks that belong to each project, by its ID: through the task graph,
 * which works ownership out (GLOSSARY: 所属项目), never from the block
 * hierarchy alone.
 */
function summarizeProjects(
  snapshot: TaskGraphSnapshot,
  graph: TaskGraph,
): Map<ProjectId, ProjectSummary> {
  const summaries = new Map<
    ProjectId,
    { tasks: ProjectTask[]; lastCompletion?: CompletionEntry }
  >();
  for (const item of snapshot.tasks) {
    const entry = graph.entry(item.task.id);
    if (!entry?.project) continue;
    const summary = summaries.get(entry.project.id) ?? { tasks: [] };
    summary.tasks.push({
      status: item.task.status,
      effort: item.task.effort,
      recurs: recurs(item.task.recurrence),
      doneAncestor: entry.doneAncestor !== null,
      nextAction: entry.nextAction,
    });
    const last = item.lastCompletion;
    if (
      last &&
      (!summary.lastCompletion ||
        last.at.getTime() > summary.lastCompletion.at.getTime())
    )
      summary.lastCompletion = last;
    summaries.set(entry.project.id, summary);
  }
  return summaries;
}

/** What turning snapshot tasks into nodes needs. */
interface NodeContext {
  readonly tree: TaskTree;
  readonly graph: TaskGraph;
  readonly keep: TaskId | undefined;
  readonly projects: ReadonlyMap<ProjectId, ProjectSummary>;
  /** The last start that is reached: today plus the start preview days. */
  readonly startsBy: CalendarDate;
}

function projectNode(
  context: NodeContext,
  project: Project,
  children: readonly AllTasksNode[],
): ProjectNode {
  const tasks = context.projects.get(project.id)?.tasks ?? [];
  const notStarted =
    project.start !== null && compareDays(project.start, context.startsBy) > 0;
  return {
    kind: "project",
    project,
    faded: null,
    children,
    progress: projectProgress(tasks),
    noNextAction: lacksNextAction(project, !notStarted, tasks),
    unfinished: unfinishedTaskCount(tasks),
    taskCount: tasks.length,
    notStarted,
  };
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
      context.projects.get(entry.item.project.id)?.tasks ?? [],
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

/** What the filter and the search text let through. */
interface Narrowing {
  readonly filter: AllTasksFilter;
  /** What is searched for, as typed; empty: no search. */
  readonly search: string;
}

function narrowing(options: ReadAllTasksOptions): Narrowing {
  return { filter: options.filter ?? {}, search: options.search ?? "" };
}

/** Something is searched for: not only white space. */
function searches(narrow: Narrowing): boolean {
  return narrow.search.trim() !== "";
}

/** The filter or the search lets fewer through than every task. */
function narrows(narrow: Narrowing): boolean {
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
  const doneLets = (task: Task) =>
    filterLets(narrow.filter, task) && found(narrow, task);
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
          tree.push(projectNode(context, project, children));
        continue;
      }
      // A finished project holding the kept task stays in the tree for it.
      const kept = entry.below.flatMap(
        (item) => keptPath(context, item, project.id) ?? [],
      );
      if (kept.length > 0) {
        tree.push(projectNode(context, project, kept));
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
          item: projectNode(context, project, []),
          lastCompletion: context.projects.get(project.id)?.lastCompletion,
        });
      }
      continue;
    }
    const item = entry.item;
    if (holdsOpen(context.tree, item)) {
      const shown = shownNode(context, narrow, item, counted, null);
      if (shown) tree.push(shown);
      continue;
    }
    // A done subtree holding the kept task stays in the tree for it, so it
    // is not in the done section too; the other dimensions and the search
    // look at the item's own top-level task.
    const kept = keptPath(context, item, null);
    if (kept) tree.push(kept);
    else if (doneLets(item.task))
      done.push({
        item: {
          kind: "task",
          task: item.task,
          shownProject: shownProjectOf(context, item, null),
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
  // A task with no completion recorded (e.g. made done in Orca directly) has
  // no reliable time, so it is never among the recent ones.
  const firstDay = addDays(today, 1 - doneSectionDays);
  const listed = done.filter(
    (entry) =>
      everyDay ||
      (entry.lastCompletion !== undefined &&
        compareDays(entry.lastCompletion.day, firstDay) >= 0),
  );
  // The most recent last completion first; those with none after, in note
  // order (`done` is in note order already, and the sort is stable).
  const time = (entry: DoneEntry) =>
    entry.lastCompletion?.at.getTime() ?? Number.NEGATIVE_INFINITY;
  listed.sort((a, b) => (time(a) === time(b) ? 0 : time(b) - time(a)));
  return {
    items: listed.map((entry) => entry.item),
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
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const previewDays = deps.startPreviewDays.current();
    const graph = analyzeTaskGraph(snapshot, { today, previewDays });
    const context: NodeContext = {
      tree: buildTaskTree(snapshot),
      graph,
      keep: options.keep,
      projects: summarizeProjects(snapshot, graph),
      startsBy: addDays(today, previewDays),
    };
    if (options.project !== undefined) {
      const scoped = (snapshot.projects ?? []).find(
        (item) => item.project.id === options.project,
      );
      if (!scoped) return { kind: "noProject" };
      return {
        kind: "project",
        project: projectNode(context, scoped.project, []),
      };
    }
    const narrow = narrowing(options);
    const { tree, matchCount, done } = narrowedTree(context, narrow);
    const sortedOf = (node: AllTasksNode): Sorted => {
      if (node.kind === "task") {
        const entry = graph.entry(node.task.id);
        return {
          ...node.task,
          score: score(
            {
              task: node.task,
              effectiveStart: entry?.effectiveStart ?? null,
              ancestorRatings: entry?.ancestorRatings ?? [],
            },
            today,
          ),
        };
      }
      return { ...node.project, score: projectScore(node.project, today) };
    };
    const compare = comparator(
      options.sort ?? "note",
      options.direction ?? "ascending",
      sortedOf,
    );
    // Stable: ties keep note order.
    if (compare) tree.sort(compare);
    // Showing earlier items or searching lifts the done section's range.
    const everyDay = options.showEarlierDone === true || searches(narrow);
    return { tree, matchCount, done: doneSection(done, today, everyDay) };
  }
  return readAllTasks;
}
