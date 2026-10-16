// Use case: read a project's board (GLOSSARY: 布局, 分列方式, #166), for
// the project details' board layout: the whole board as the layout shows
// it, the interface only rendering it.
import {
  analyzeTaskGraph,
  type SnapshotTask,
} from "../../domain/blocking/task-graph";
import type { ProjectId } from "../../domain/project/project";
import type { Task, TaskStatus } from "../../domain/task/task";
import { taskStatuses } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";
import { projectNode, projectNodeContext } from "./project-nodes";
import {
  type AllTasksSort,
  byLastCompletion,
  comparator,
  marksBlocked,
  type ProjectNode,
  projectRootTasks,
  type SortDirection,
  taskSorted,
} from "./read-all-tasks";

/**
 * A card on the board (GLOSSARY: 任务卡片): a task with what its card shows.
 * Later steps add to it (next action, subtask counts, descendant rows, #167).
 */
export interface BoardCard {
  readonly task: Task;
  /** As `TaskNode.blocked`: subtask blocking alone does not mark it. */
  readonly blocked: boolean;
  /**
   * The text of its parent task (GLOSSARY: 父任务), as the project details
   * show it: only when it has one, which is not the project's. `null`: none.
   */
  readonly parentText: string | null;
}

/** A column of the board by status: every card of that status. */
export interface StatusColumn {
  readonly status: TaskStatus;
  /** How many cards the column holds, earlier done ones too (its head's count). */
  readonly count: number;
  /**
   * In order: by the sort asked for; in the done column, those last
   * completed within the last `doneSectionDays` logical days, the most
   * recent first.
   */
  readonly cards: readonly BoardCard[];
  /**
   * The done column's earlier cards ("earlier done"), in the same order;
   * empty in every other column.
   */
  readonly earlier: readonly BoardCard[];
}

/** The board by status (GLOSSARY: 分列方式): one column per status. */
export interface StatusBoard {
  readonly grouping: "status";
  /** The six statuses' columns, in a fixed order, empty ones kept. */
  readonly columns: readonly StatusColumn[];
}

/**
 * The board, told apart by its grouping (GLOSSARY: 分列方式). Only by status
 * so far; by project root task joins it (#171).
 */
export type ProjectBoard = StatusBoard;

/**
 * - `project`: the project itself, as the project details' attribute area
 *   shows it (as `ProjectScopeRead`), and its board.
 * - `noProject`: the block is not a project, or the project tag is paused:
 *   there is no such project to show.
 */
export type ProjectBoardRead =
  | {
      readonly kind: "project";
      /** Without children. */
      readonly project: ProjectNode;
      readonly board: ProjectBoard;
    }
  | { readonly kind: "noProject" };

export interface ReadProjectBoardOptions {
  /** The project whose board is read. */
  readonly project: ProjectId;
  /**
   * How each column's cards are ordered; done cards are not (most recent
   * completion first). The options are the tree's (`AllTasksSort`), ties in
   * note order. Defaults to `score`.
   */
  readonly sort?: AllTasksSort;
  /** As `ReadAllTasksOptions.direction`. Defaults to `ascending`. */
  readonly direction?: SortDirection;
}

export type ReadProjectBoard = (
  options: ReadProjectBoardOptions,
) => Promise<ProjectBoardRead>;

/** The board's columns by status, in order (GLOSSARY: 状态). */
const columnOrder: readonly TaskStatus[] = taskStatuses;

export function createReadProjectBoard(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}): ReadProjectBoard {
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
    const roots = projectRootTasks(snapshot, graph, scoped.project.id);
    const compare = comparator(
      options.sort ?? "score",
      options.direction ?? "ascending",
      (card: BoardCard) => taskSorted(card.task, graph, today),
    );
    const cardOf = (item: SnapshotTask): BoardCard => ({
      task: item.task,
      blocked: marksBlocked(graph.entry(item.task.id)),
      parentText:
        item.parentId === null
          ? null
          : (graph.entry(item.parentId)?.task.text ?? null),
    });
    const columns = columnOrder.map((status): StatusColumn => {
      const items = roots.filter((item) => item.task.status === status);
      if (status === "done") {
        // Done cards go by completion, not by the sort.
        const { recent, earlier } = byLastCompletion(
          items,
          (item) => item.lastCompletion,
          today,
        );
        return {
          status,
          count: items.length,
          cards: recent.map(cardOf),
          earlier: earlier.map(cardOf),
        };
      }
      const cards = items.map(cardOf);
      // Stable: ties keep note order.
      if (compare) cards.sort(compare);
      return { status, count: cards.length, cards, earlier: [] };
    });
    return {
      kind: "project",
      project: projectNode(
        projectNodeContext(snapshot, graph, { today, previewDays, boundary }),
        scoped.project,
        [],
      ),
      board: { grouping: "status", columns },
    };
  };
}
