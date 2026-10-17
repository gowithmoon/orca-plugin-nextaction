// Use case: read a project's gantt chart (GLOSSARY: 布局, #176, #186), for
// the project details' gantt layout: the whole chart as the layout shows
// it, the interface only drawing it. The rows are the project's tasks in
// note order; collapsing them is the interface's.
import {
  analyzeTaskGraph,
  type SnapshotTask,
  type TaskGraphEntry,
} from "../../domain/blocking/task-graph";
import type { ProjectId } from "../../domain/project/project";
import { isOverdue } from "../../domain/task/overdue";
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
  marksBlocked,
  matches,
  narrowing,
  narrows,
  type ProjectNode,
  projectRootTasks,
  type TaskTree,
} from "./read-all-tasks";

/**
 * What a row draws on the time axis, told apart by `kind`. For now only a
 * bar; the bracket and the unplaced task (GLOSSARY: 待排期任务) come with
 * #177.
 */
export type GanttBar = DatedBar;

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
   * the task wrote both (#177 borrows the other ends).
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
  /** What it draws; `null`: nothing yet (a task without both dates, #177). */
  readonly bar: GanttBar | null;
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
}

/** Days `from` up to `until`, `until` not included. */
export interface HeldBack {
  readonly from: CalendarDate;
  readonly until: CalendarDate;
}

/** The chart of a project. */
export interface ProjectGantt {
  /** Every task of the project, in note order (document preorder). */
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

/** The bar of a task with both dates; `null` for one without. */
function barOf(task: Task): GanttBar | null {
  if (task.start === null || task.due === null) return null;
  return { kind: "bar", start: task.start, due: task.due, borrowed: "none" };
}

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

/** How a row's task stands, beside its place in the tree and its bar. */
type RowStanding = Pick<GanttRow, "overdue" | "blocked" | "heldBack">;

/**
 * `item` and its descendant tasks with their depth, in note order: those
 * `kept`, a task left out with its subtree.
 */
function rowsOf(
  tree: TaskTree,
  item: SnapshotTask,
  depth: number,
  kept: (item: SnapshotTask) => boolean,
  standing: (item: SnapshotTask) => RowStanding,
): GanttRow[] {
  if (!kept(item)) return [];
  return [
    {
      task: item.task,
      depth,
      parentId: depth === 0 ? null : item.parentId,
      bar: barOf(item.task),
      ...standing(item),
    },
    ...tree
      .childrenOf(item.task.id)
      .flatMap((child) => rowsOf(tree, child, depth + 1, kept, standing)),
  ];
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
    const standing = (item: SnapshotTask): RowStanding => ({
      overdue: isOverdue(item.task, today),
      blocked: marksBlocked(graph.entry(item.task.id)),
      heldBack: heldBackOf(graph.entry(item.task.id)),
    });
    const rows = projectRootTasks(snapshot, graph, scoped.project.id).flatMap(
      (root) => rowsOf(tree, root, 0, kept, standing),
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
