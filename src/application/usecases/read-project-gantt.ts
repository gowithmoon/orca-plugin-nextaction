// Use case: read a project's gantt chart (GLOSSARY: 布局, #176, #186), for
// the project details' gantt layout: the whole chart as the layout shows
// it, the interface only drawing it. The rows are the project's tasks in
// note order; collapsing them is the interface's.
import {
  analyzeTaskGraph,
  type SnapshotTask,
} from "../../domain/blocking/task-graph";
import type { ProjectId } from "../../domain/project/project";
import type { CalendarDate, Task, TaskId } from "../../domain/task/task";
import { compareDays } from "../../domain/time/calendar-days";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";
import { projectNode, projectNodeContext } from "./project-nodes";
import {
  type AllTasksFilter,
  buildTaskTree,
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
): GanttRow[] {
  if (!kept(item)) return [];
  const below = tree
    .childrenOf(item.task.id)
    .flatMap((child) => rowsOf(tree, child, depth + 1, kept, project));
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
    const rows = projectRootTasks(snapshot, graph, scoped.project.id).flatMap(
      (root) => rowsOf(tree, root, 0, kept, scoped.project),
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
      },
    };
  };
}
