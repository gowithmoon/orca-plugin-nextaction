// Use case: read a project's board (GLOSSARY: 布局, 分列方式, #166), for
// the project details' board layout: the whole board as the layout shows
// it, the interface only rendering it.
import {
  analyzeTaskGraph,
  type SnapshotTask,
  type TaskGraphSnapshot,
} from "../../domain/blocking/task-graph";
import type { ProjectId } from "../../domain/project/project";
import type { Task, TaskId, TaskStatus } from "../../domain/task/task";
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
  /**
   * Its parent task (GLOSSARY: 父任务), the project's too; `null`: none
   * (a project block is no task).
   * A drop on a card tells its parent task apart by it (#169).
   */
  readonly parentId: TaskId | null;
  /** It is a next action (GLOSSARY: 下一步行动): the board's dot (#167). */
  readonly nextAction: boolean;
  /**
   * Its direct subtasks (GLOSSARY: 子任务), deeper descendant tasks not
   * counted: how many are done, and how many in all (0: none).
   */
  readonly subtasks: { readonly done: number; readonly total: number };
  /**
   * Among all its descendant tasks (GLOSSARY: 后代任务), at any depth: how
   * many are doing, and how many are next actions; the collapsed card's
   * "Doing N · Next N".
   */
  readonly descendants: {
    readonly doing: number;
    readonly nextActions: number;
  };
  /**
   * All its descendant tasks, the rows the expanded card lists: in note
   * order (document preorder), whatever the sort; none without subtasks.
   */
  readonly rows: readonly BoardRow[];
}

/** A descendant task's row in an expanded card (#167). */
export interface BoardRow {
  readonly task: Task;
  /** Its indent: 0 for a direct subtask of the card, 1 below that, … */
  readonly depth: number;
  /** Its parent task: the card's task or a row above it (#169). */
  readonly parentId: TaskId | null;
  /** As `BoardCard.blocked`. */
  readonly blocked: boolean;
  /** As `BoardCard.nextAction`. */
  readonly nextAction: boolean;
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
 * A project root task's column head (#171): the project root task itself,
 * as a column head shows it.
 */
export interface RootColumnHead {
  readonly task: Task;
  /** As `BoardCard.blocked`. */
  readonly blocked: boolean;
  /** Its parent task, as `BoardCard.parentId`: for a drop on its column. */
  readonly parentId: TaskId | null;
  /** Its direct subtasks: how many are done, and how many in all. */
  readonly subtasks: { readonly done: number; readonly total: number };
}

/**
 * The cards of a column by project root task: the open ones by the sort
 * asked for, the done ones apart ("Done N", collapsed by default): every
 * one, not only the last `doneSectionDays` days, the most recent completion
 * first.
 */
export interface RootBoardCards {
  readonly cards: readonly BoardCard[];
  readonly done: readonly BoardCard[];
}

/**
 * A project root task with subtasks: its column, its direct subtasks the
 * cards (deeper descendant tasks folded in them).
 */
export interface RootColumn extends RootBoardCards {
  readonly head: RootColumnHead;
  /**
   * It and all its descendant tasks are done: the column is collapsed to a
   * narrow strip by default, after every other column.
   */
  readonly finished: boolean;
}

/**
 * The board by project root task (GLOSSARY: 分列方式, #171): "Other" first,
 * the project root tasks without subtasks its cards; then a column for each
 * project root task with subtasks, in note order, finished ones last.
 */
export interface RootBoard {
  readonly grouping: "root";
  readonly other: RootBoardCards;
  readonly columns: readonly RootColumn[];
}

/** The board, told apart by its grouping (GLOSSARY: 分列方式). */
export type ProjectBoard = StatusBoard | RootBoard;

/** How the board groups its columns (GLOSSARY: 分列方式). */
export type BoardGrouping = ProjectBoard["grouping"];

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
  /** How the columns are grouped (#171). Defaults to `status`. */
  readonly grouping?: BoardGrouping;
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

/** Every task's subtasks, in note order. */
function childrenByParent(
  snapshot: TaskGraphSnapshot,
): ReadonlyMap<TaskId, readonly SnapshotTask[]> {
  const children = new Map<TaskId, SnapshotTask[]>();
  const ordered = [...snapshot.tasks].sort((a, b) => a.position - b.position);
  for (const item of ordered) {
    if (item.parentId === null) continue;
    const siblings = children.get(item.parentId) ?? [];
    siblings.push(item);
    children.set(item.parentId, siblings);
  }
  return children;
}

function subtaskCounts(
  subtasks: readonly SnapshotTask[],
): BoardCard["subtasks"] {
  return {
    done: subtasks.filter((item) => item.task.status === "done").length,
    total: subtasks.length,
  };
}

/** Every descendant task of `id` with its depth, in note order (preorder). */
function descendantsOf(
  children: ReadonlyMap<TaskId, readonly SnapshotTask[]>,
  id: TaskId,
  depth = 0,
): { readonly item: SnapshotTask; readonly depth: number }[] {
  return (children.get(id) ?? []).flatMap((item) => [
    { item, depth },
    ...descendantsOf(children, item.task.id, depth + 1),
  ]);
}

function descendantCounts(rows: readonly BoardRow[]): BoardCard["descendants"] {
  return {
    doing: rows.filter((row) => row.task.status === "doing").length,
    nextActions: rows.filter((row) => row.nextAction).length,
  };
}

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
    const children = childrenByParent(snapshot);
    const compare = comparator(
      options.sort ?? "score",
      options.direction ?? "ascending",
      (card: BoardCard) => taskSorted(card.task, graph, today),
    );
    const nextAction = (id: TaskId) => graph.entry(id)?.nextAction ?? false;
    const cardOf = (item: SnapshotTask): BoardCard => {
      const rows = descendantsOf(children, item.task.id).map(
        ({ item: row, depth }): BoardRow => ({
          task: row.task,
          depth,
          parentId: row.parentId,
          blocked: marksBlocked(graph.entry(row.task.id)),
          nextAction: nextAction(row.task.id),
        }),
      );
      return {
        task: item.task,
        blocked: marksBlocked(graph.entry(item.task.id)),
        parentText:
          item.parentId === null
            ? null
            : (graph.entry(item.parentId)?.task.text ?? null),
        parentId: item.parentId,
        nextAction: nextAction(item.task.id),
        subtasks: subtaskCounts(children.get(item.task.id) ?? []),
        descendants: descendantCounts(rows),
        rows,
      };
    };
    const sorted = (items: readonly SnapshotTask[]): BoardCard[] => {
      const cards = items.map(cardOf);
      // Stable: ties keep note order.
      if (compare) cards.sort(compare);
      return cards;
    };
    const project = projectNode(
      projectNodeContext(snapshot, graph, { today, previewDays, boundary }),
      scoped.project,
      [],
    );
    if (options.grouping === "root") {
      // A project root task's descendant tasks are all the project's: the
      // parent task's ownership decides (domain/project/ownership.ts).
      const subtasksOf = (item: SnapshotTask) =>
        children.get(item.task.id) ?? [];
      const cardsOf = (items: readonly SnapshotTask[]): RootBoardCards => ({
        cards: sorted(items.filter((item) => item.task.status !== "done")),
        // Every day's: no earlier ones apart.
        done: byLastCompletion(
          items.filter((item) => item.task.status === "done"),
          (item) => item.lastCompletion,
          today,
          true,
        ).recent.map(cardOf),
      });
      const columns = roots
        .filter((root) => subtasksOf(root).length > 0)
        .map(
          (root): RootColumn => ({
            head: {
              task: root.task,
              blocked: marksBlocked(graph.entry(root.task.id)),
              parentId: root.parentId,
              subtasks: subtaskCounts(subtasksOf(root)),
            },
            finished:
              root.task.status === "done" &&
              descendantsOf(children, root.task.id).every(
                ({ item }) => item.task.status === "done",
              ),
            ...cardsOf(subtasksOf(root)),
          }),
        );
      // Stable: the finished ones last, each part in note order.
      columns.sort((a, b) => Number(a.finished) - Number(b.finished));
      return {
        kind: "project",
        project,
        board: {
          grouping: "root",
          other: cardsOf(roots.filter((root) => subtasksOf(root).length === 0)),
          columns,
        },
      };
    }
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
      const cards = sorted(items);
      return { status, count: cards.length, cards, earlier: [] };
    });
    return {
      kind: "project",
      project,
      board: { grouping: "status", columns },
    };
  };
}
