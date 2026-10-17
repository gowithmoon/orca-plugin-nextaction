// Use case: read a project's gantt chart (GLOSSARY: 布局, #176, #186), for
// the project details' gantt layout: the whole chart as the layout shows
// it, the interface only drawing it. The rows are the project's tasks in
// note order; collapsing them is the interface's.
import { dependencyConflicts } from "../../domain/blocking/date-conflict";
import {
  analyzeTaskGraph,
  type SnapshotTask,
  type TaskGraphEntry,
} from "../../domain/blocking/task-graph";
import type { ProjectId } from "../../domain/project/project";
import { isOverdue } from "../../domain/task/overdue";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import { addDays, compareDays } from "../../domain/time/calendar-days";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";
import { projectNode, projectNodeContext } from "./project-nodes";
import {
  type AllTasksFilter,
  buildTaskTree,
  marksBlocked,
  matches,
  narrowing,
  narrows,
  type ProjectNode,
  projectRootTasks,
  type TaskTree,
} from "./read-all-tasks";

/**
 * What a row draws on the time axis, told apart by `kind`: a bar, a bracket,
 * or an unplaced task (GLOSSARY: 待排期任务) drawing nothing on the axis.
 */
export type GanttBar = DatedBar | BracketBar | UnplacedBar;

/**
 * A thin bracket over a task that cannot be drawn itself but has
 * descendant tasks on the chart: from the earliest to the latest of their
 * bars, both days included. It keeps the tree whole; never dragged.
 */
export interface BracketBar {
  readonly kind: "bracket";
  readonly start: CalendarDate;
  readonly due: CalendarDate;
}

/**
 * A task with no bar (GLOSSARY: 待排期任务), its descendant tasks none
 * either: no dates, the missing end not among the project's dates, or the
 * borrowed date the wrong side of its own. Shown in the chart's unplaced
 * tasks' section, not in the tree.
 */
export interface UnplacedBar {
  readonly kind: "unplaced";
}

/**
 * A bar from `start` to `due`, both days included: when the task can be
 * done. Drawn wherever they fall, outside the project's dates too.
 */
export interface DatedBar {
  readonly kind: "bar";
  readonly start: CalendarDate;
  readonly due: CalendarDate;
  /**
   * Which end is the project's date, the task lacking its own: `none` when
   * the task wrote both.
   */
  readonly borrowed: "none" | "start" | "due";
}

/** A row of the chart: a task of the project, where it sits in the tree. */
export interface GanttRow {
  readonly task: Task;
  /** Its indent: 0 for a project root task, 1 below that, … */
  readonly depth: number;
  /** Its parent task (GLOSSARY: 父任务); `null` for a project root task. */
  readonly parentId: TaskId | null;
  /** What it draws. */
  readonly bar: GanttBar;
  /**
   * Overdue (GLOSSARY: 截止日期): not done, its own due date passed; its bar
   * is outlined in red. A done task never is.
   */
  readonly overdue: boolean;
  /**
   * Marked blocked as the board's cards are (`marksBlocked`): to do or in
   * progress, blocked by anything but its subtasks. A lock at its bar's
   * left end.
   */
  readonly blocked: boolean;
  /**
   * The stretch held back by an ancestor task's or the project's later start
   * (GLOSSARY: 开始日期): from the task's own start to the effective start,
   * that day not included; shaded with hatching. `null` when the task has
   * no start of its own, or it is the effective start.
   */
  readonly heldBack: HeldBack | null;
  /**
   * Its dependencies (GLOSSARY: 依赖) on the project's tasks, in the order
   * the notes hold them: the arrows into its bar. One whose task has no row
   * or no bar drawn is listed all the same; the interface leaves out the
   * arrow it cannot draw.
   */
  readonly dependencies: readonly GanttDependency[];
  /**
   * Its dependencies on tasks outside the project, in the order the notes
   * hold them: a mark on its bar, no arrow. A stale dependency (GLOSSARY:
   * 失效依赖) is in neither list.
   */
  readonly outsideDependencies: readonly GanttOutsideDependency[];
}

/** A dependency on a task outside the project: its mark names the task. */
export interface GanttOutsideDependency {
  readonly task: TaskId;
  /** The task's own text, as `Task.text`. */
  readonly text: string;
}

/**
 * A dependency between two of the project's tasks (GLOSSARY: 依赖): an
 * arrow from the end of `from`'s bar to the start of `to`'s.
 */
export interface GanttDependency {
  /** The task depended on. */
  readonly from: TaskId;
  /** The task that waits for it. */
  readonly to: TaskId;
  /**
   * `to`'s dependency delay (GLOSSARY: 依赖延迟) in days, the same on each of
   * its arrows; 0 for none.
   */
  readonly delay: number;
  /**
   * Whether `to`'s date conflict (GLOSSARY: 日期冲突) comes from this
   * dependency: its arrow is red, a red triangle at the head of `to`'s bar.
   * By the dates the tasks wrote, never borrowed ones.
   */
  readonly conflict: boolean;
}

/** Days `from` up to `until`, `until` not included. */
export interface HeldBack {
  readonly from: CalendarDate;
  readonly until: CalendarDate;
}

/** The chart of a project. */
export interface ProjectGantt {
  /**
   * Every task of the project, in note order (document preorder), but the
   * done unplaced tasks. The unplaced ones (each one's subtree unplaced
   * too) are for the unplaced tasks' section, not the tree.
   */
  readonly rows: readonly GanttRow[];
  /** The project's own start and due dates; `null` when it lacks one. */
  readonly projectStart: CalendarDate | null;
  readonly projectDue: CalendarDate | null;
  /** The logical day of the read, for the today line. */
  readonly today: CalendarDate;
  /**
   * The days the chart scrolls over, both included (#179): the project's
   * dates, every row's bar and today, two weeks before and after.
   */
  readonly range: GanttRange;
}

/** A run of days, both included. */
export interface GanttRange {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
}

/** Days before and after the dates drawn (#176). */
const rangeMargin = 14;

/** The range the chart scrolls over (`ProjectGantt.range`). */
function rangeOf(
  rows: readonly GanttRow[],
  today: CalendarDate,
  projectDates: readonly (CalendarDate | null)[],
): GanttRange {
  const all = [
    today,
    ...projectDates.filter((date): date is CalendarDate => date !== null),
  ];
  for (const row of rows) {
    // A bracket spans its subtasks' bars, already counted; an unplaced task
    // draws nothing.
    if (row.bar.kind !== "unplaced") all.push(row.bar.start, row.bar.due);
  }
  const sorted = all.sort(compareDays);
  const first = sorted[0] ?? today;
  const last = sorted[sorted.length - 1] ?? today;
  return {
    start: addDays(first, -rangeMargin),
    end: addDays(last, rangeMargin),
  };
}

/**
 * - `project`: the project and its chart.
 * - `noProject`: the block is not a project, or the project tag is paused:
 *   there is no such project to show.
 */
export type ProjectGanttRead =
  | {
      readonly kind: "project";
      /**
       * The project itself, as the project details' attribute area shows it
       * (as `ProjectScopeRead`); without children.
       */
      readonly project: ProjectNode;
      readonly gantt: ProjectGantt;
    }
  | { readonly kind: "noProject" };

export interface ReadProjectGanttOptions {
  /** The project whose chart is read. */
  readonly project: ProjectId;
  /**
   * The project details' filter, shared with the tree and the board, by the
   * tree's rules (`matches`): a row stays when its task or any descendant
   * task passes. No sort: the rows keep note order.
   */
  readonly filter?: AllTasksFilter;
  /** As `ReadAllTasksOptions.search`, shared likewise. */
  readonly search?: string;
}

export type ReadProjectGantt = (
  options: ReadProjectGanttOptions,
) => Promise<ProjectGanttRead>;

/** The project's own start and due dates, for a task to borrow. */
interface ProjectDates {
  readonly start: CalendarDate | null;
  readonly due: CalendarDate | null;
}

/**
 * The bar of a task: its own dates, a missing end borrowed from the
 * project's; unplaced when none can be drawn. One with both dates always
 * can, outside the project's dates too (#176).
 */
function barOf(task: Task, project: ProjectDates): GanttBar {
  if (task.start !== null && task.due !== null) {
    return { kind: "bar", start: task.start, due: task.due, borrowed: "none" };
  }
  if (
    task.due !== null &&
    project.start !== null &&
    compareDays(project.start, task.due) <= 0
  ) {
    return {
      kind: "bar",
      start: project.start,
      due: task.due,
      borrowed: "start",
    };
  }
  if (
    task.start !== null &&
    project.due !== null &&
    compareDays(task.start, project.due) <= 0
  ) {
    return {
      kind: "bar",
      start: task.start,
      due: project.due,
      borrowed: "due",
    };
  }
  return { kind: "unplaced" };
}

/** A row's two lists of dependencies. */
type RowDependencies = Pick<GanttRow, "dependencies" | "outsideDependencies">;

/**
 * The stretch of `entry`'s task held back by a later effective start;
 * `null` for none.
 */
function heldBackOf(entry: TaskGraphEntry | undefined): HeldBack | null {
  const own = entry?.task.start ?? null;
  const effective = entry?.effectiveStart ?? null;
  if (own === null || effective === null) return null;
  if (compareDays(own, effective) >= 0) return null;
  return { from: own, until: effective };
}

/**
 * How a row's task stands, beside its place in the tree and its bar; its
 * dependencies too (#182).
 */
type RowStanding = Pick<GanttRow, "overdue" | "blocked" | "heldBack"> &
  RowDependencies;

/**
 * `item` and its descendant tasks with their depth, in note order: those
 * `kept`, a task left out with its subtree; a done unplaced task left out
 * alone. A bracket spans the kept descendant tasks' bars.
 */
function rowsOf(
  tree: TaskTree,
  item: SnapshotTask,
  depth: number,
  kept: (item: SnapshotTask) => boolean,
  project: ProjectDates,
  standing: (item: SnapshotTask) => RowStanding,
): GanttRow[] {
  if (!kept(item)) return [];
  const below = tree
    .childrenOf(item.task.id)
    .flatMap((child) =>
      rowsOf(tree, child, depth + 1, kept, project, standing),
    );
  const own = barOf(item.task, project);
  const bar = own.kind === "unplaced" ? bracketOver(below, depth + 1) : own;
  // A done unplaced task is no longer to be placed: not shown at all (#177).
  if (bar.kind === "unplaced" && item.task.status === "done") return below;
  return [
    {
      task: item.task,
      depth,
      parentId: depth === 0 ? null : item.parentId,
      bar,
      ...standing(item),
    },
    ...below,
  ];
}

/**
 * The bracket over the rows at `depth` among `rows` (a task's subtree
 * below it): from the earliest to the latest of their bars and brackets;
 * unplaced when none has one.
 */
function bracketOver(rows: readonly GanttRow[], depth: number): GanttBar {
  let start: CalendarDate | null = null;
  let due: CalendarDate | null = null;
  for (const { bar, depth: at } of rows) {
    if (at !== depth || bar.kind === "unplaced") continue;
    if (start === null || compareDays(bar.start, start) < 0) start = bar.start;
    if (due === null || compareDays(bar.due, due) > 0) due = bar.due;
  }
  if (start === null || due === null) return { kind: "unplaced" };
  return { kind: "bracket", start, due };
}

export function createReadProjectGantt(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}): ReadProjectGantt {
  return async (options) => {
    const snapshot = await deps.repository.readTaskGraph();
    const boundary = deps.dayBoundary.current();
    const today = logicalDay(deps.clock.now(), boundary);
    const previewDays = deps.startPreviewDays.current();
    const graph = analyzeTaskGraph(snapshot, { today, previewDays });
    const scoped = (snapshot.projects ?? []).find(
      (item) => item.project.id === options.project,
    );
    if (!scoped) return { kind: "noProject" };
    // A project root task's descendant tasks are all the project's: the
    // parent task's ownership decides (domain/project/ownership.ts).
    const tree = buildTaskTree(snapshot);
    const narrow = narrowing(options);
    const narrowed = narrows(narrow);
    /**
     * Not narrowed, or it or any of its descendant tasks passes; worked out
     * once per task for the read.
     */
    const keptById = new Map<TaskId, boolean>();
    const kept = (item: SnapshotTask): boolean => {
      if (!narrowed) return true;
      const known = keptById.get(item.task.id);
      if (known !== undefined) return known;
      const found =
        matches(narrow, item.task) || tree.childrenOf(item.task.id).some(kept);
      keptById.set(item.task.id, found);
      return found;
    };
    const lookup = (id: TaskId) => graph.entry(id)?.task;
    const dependenciesOf = (task: Task): RowDependencies => {
      const inside: GanttDependency[] = [];
      const outside: GanttOutsideDependency[] = [];
      for (const id of task.dependencies) {
        // Not a task in the graph: a stale dependency, shown nowhere.
        const entry = graph.entry(id);
        if (!entry) continue;
        if (entry.project?.id === scoped.project.id) {
          inside.push({
            from: id,
            to: task.id,
            delay: task.dependencyDelay,
            conflict: dependencyConflicts(task, id, lookup),
          });
        } else {
          outside.push({ task: id, text: entry.task.text });
        }
      }
      return { dependencies: inside, outsideDependencies: outside };
    };
    const standing = (item: SnapshotTask): RowStanding => ({
      overdue: isOverdue(item.task, today),
      blocked: marksBlocked(graph.entry(item.task.id)),
      heldBack: heldBackOf(graph.entry(item.task.id)),
      ...dependenciesOf(item.task),
    });
    const rows = projectRootTasks(snapshot, graph, scoped.project.id).flatMap(
      (root) => rowsOf(tree, root, 0, kept, scoped.project, standing),
    );
    const project = projectNode(
      projectNodeContext(snapshot, graph, { today, previewDays, boundary }),
      scoped.project,
      [],
    );
    return {
      kind: "project",
      project,
      gantt: {
        rows,
        projectStart: scoped.project.start,
        projectDue: scoped.project.due,
        today,
        range: rangeOf(rows, today, [scoped.project.start, scoped.project.due]),
      },
    };
  };
}
