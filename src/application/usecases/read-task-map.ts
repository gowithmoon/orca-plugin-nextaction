// Use case: read the task map (GLOSSARY: 任务全景图, #213): the whole map as
// the view draws it, the interface only measuring, laying it out
// (domain/task-map/layout.ts) and drawing it. One read of the task graph:
// the project boxes and the no-project area, each holding the task trees
// of the tasks that belong to it (GLOSSARY: 所属项目) wherever they sit in
// the notes, nested by block, siblings in note order.
import {
  analyzeTaskGraph,
  type SnapshotTask,
} from "../../domain/blocking/task-graph";
import type { Project } from "../../domain/project/project";
import type { Task, TaskId } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";
import { marksBlocked, projectRootTasks } from "./read-all-tasks";

/** A task on the map: a card, or a box headed by its card when it has children. */
export interface TaskMapNode {
  readonly task: Task;
  /** A next action (GLOSSARY: 下一步行动): the card is emphasised. */
  readonly nextAction: boolean;
  /** Marked blocked as other views' cards are (`marksBlocked`). */
  readonly blocked: boolean;
  /** Faded: waiting, someday, or a done task shown (as a box). */
  readonly faded: boolean;
  /**
   * Its subtasks done, of all its subtasks, shown or not: the head's
   * "N/M done" (#213).
   */
  readonly subtasks: { readonly done: number; readonly total: number };
  /** Its subtasks are done one after another: laid out left to right. */
  readonly sequential: boolean;
  /** Its subtasks shown on the map, in note order. */
  readonly children: readonly TaskMapNode[];
}

/** A project's box (its status and name in the head). */
export interface TaskMapProjectArea {
  readonly kind: "project";
  readonly project: Project;
  readonly tasks: readonly TaskMapNode[];
}

/** The tasks belonging to no project. */
export interface TaskMapNoProjectArea {
  readonly kind: "noProject";
  readonly tasks: readonly TaskMapNode[];
}

export type TaskMapArea = TaskMapProjectArea | TaskMapNoProjectArea;

export interface TaskMapRead {
  /** The project boxes in note order, then the no-project area; none empty. */
  readonly areas: readonly TaskMapArea[];
  /**
   * The sequence edges: between adjacent subtasks shown of a sequential
   * parent task, in note order; a hidden subtask between two is skipped.
   */
  readonly sequenceEdges: readonly TaskMapEdge[];
}

/** An edge drawn left to right, from one task on the map to another. */
export interface TaskMapEdge {
  readonly from: TaskId;
  readonly to: TaskId;
}

export type ReadTaskMap = () => Promise<TaskMapRead>;

export function createReadTaskMap(deps: {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}): ReadTaskMap {
  return async () => {
    const snapshot = await deps.repository.readTaskGraph();
    const today = logicalDay(deps.clock.now(), deps.dayBoundary.current());
    const graph = analyzeTaskGraph(snapshot, {
      today,
      previewDays: deps.startPreviewDays.current(),
    });
    const { relations } = graph;
    const sequenceEdges: TaskMapEdge[] = [];
    // A subtask belongs where its parent task does (ownership.ts): a tree
    // never crosses into another area. A done task is left out, unless
    // tasks not done below it need it as their box.
    const node = (item: SnapshotTask): TaskMapNode | null => {
      const below = relations.childrenOf(item.task.id);
      const children = below.flatMap((child) => node(child) ?? []);
      if (item.task.status === "done" && children.length === 0) return null;
      if (item.task.sequential) {
        for (let i = 1; i < children.length; i++) {
          const from = children[i - 1] as TaskMapNode;
          const to = children[i] as TaskMapNode;
          sequenceEdges.push({ from: from.task.id, to: to.task.id });
        }
      }
      const entry = graph.entry(item.task.id);
      const status = item.task.status;
      return {
        task: item.task,
        nextAction: entry?.nextAction ?? false,
        blocked: marksBlocked(entry),
        faded:
          status === "waiting" || status === "someday" || status === "done",
        sequential: item.task.sequential,
        subtasks: {
          done: below.filter((child) => child.task.status === "done").length,
          total: below.length,
        },
        children,
      };
    };
    const trees = (roots: readonly SnapshotTask[]) =>
      roots.flatMap((root) => node(root) ?? []);
    const areas: TaskMapArea[] = [];
    const projects = [...(snapshot.projects ?? [])].sort(
      (a, b) => a.position - b.position,
    );
    for (const { project } of projects) {
      const tasks = trees(projectRootTasks(graph, project.id));
      if (tasks.length > 0) areas.push({ kind: "project", project, tasks });
    }
    const ownerless = (item: SnapshotTask) =>
      graph.entry(item.task.id)?.project == null;
    const loose = trees(
      relations.tasks.filter((item) => {
        if (!ownerless(item)) return false;
        const parent = relations.parentOf(item.task.id);
        return parent === undefined || !ownerless(parent);
      }),
    );
    if (loose.length > 0) areas.push({ kind: "noProject", tasks: loose });
    return { areas, sequenceEdges };
  };
}
