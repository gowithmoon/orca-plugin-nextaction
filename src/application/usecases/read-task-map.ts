// Use case: read the task map (GLOSSARY: 任务全景图, #213): the whole map as
// the view draws it, the interface only measuring, laying it out
// (domain/task-map/layout.ts) and drawing it. One read of the task graph:
// the project boxes and the no-project area, each holding the task trees
// of the tasks that belong to it (GLOSSARY: 所属项目) wherever they sit in
// the notes, nested by block, siblings in note order.

import { dependencyConflicts } from "../../domain/blocking/date-conflict";
import { dependencyCyclesIn } from "../../domain/blocking/dependency-cycles";
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
  /** On a dependency cycle (GLOSSARY: 循环依赖): the card marked red. */
  readonly cycle: boolean;
  /**
   * Its dependency delay in days (GLOSSARY: 依赖延迟), shown where its
   * dependency edges come in: the task's, not any one edge's; 0 when it has
   * none or no dependency that is not stale.
   */
  readonly dependencyDelay: number;
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
  /**
   * The dependency edges (GLOSSARY: 依赖): from the task depended on to the
   * task depending on it, both on the map; in note order of the dependent,
   * then of its dependencies as the notes hold them. A stale dependency
   * (GLOSSARY: 失效依赖) has none.
   */
  readonly dependencyEdges: readonly TaskMapDependencyEdge[];
}

/** A dependency drawn on the map. */
export interface TaskMapDependencyEdge extends TaskMapEdge {
  /** The dependent's dependency mode is any (GLOSSARY: 依赖模式): dashed. */
  readonly any: boolean;
  /** The dependent's date conflict comes from this dependency: yellow. */
  readonly conflict: boolean;
  /** On a dependency cycle (GLOSSARY: 循环依赖): red. */
  readonly cycle: boolean;
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
    const cycles = dependencyCyclesIn(relations);
    // A done task is still shown while a task depending on it waits for
    // its own release day (#212: read from that task's blocking reason, a
    // delay passed down from an ancestor not counting).
    const awaitsRelease = (id: TaskId) =>
      relations
        .waitersOf(id)
        .some(
          (relation) =>
            relation.kind === "dependency" &&
            (graph.entry(relation.waiting)?.blockedBy ?? []).some(
              (reason) =>
                reason.kind === "dependencyDelay" &&
                reason.source === relation.waiting,
            ),
        );
    const sequenceEdges: TaskMapEdge[] = [];
    // A subtask belongs where its parent task does (ownership.ts): a tree
    // never crosses into another area. A done task is left out, unless
    // tasks not done below it need it as their box.
    const node = (item: SnapshotTask): TaskMapNode | null => {
      const below = relations.childrenOf(item.task.id);
      const children = below.flatMap((child) => node(child) ?? []);
      if (
        item.task.status === "done" &&
        children.length === 0 &&
        !awaitsRelease(item.task.id)
      ) {
        return null;
      }
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
        cycle: cycles.has(item.task.id),
        sequential: item.task.sequential,
        dependencyDelay: relations
          .waitsFor(item.task.id)
          .some((relation) => relation.kind === "dependency")
          ? item.task.dependencyDelay
          : 0,
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
    const shown = new Set<TaskId>();
    const mark = (item: TaskMapNode) => {
      shown.add(item.task.id);
      item.children.forEach(mark);
    };
    for (const area of areas) area.tasks.forEach(mark);
    // Only an edge's own two ends count: a descendant also waits for what
    // its ancestors depend on, which is no edge drawn.
    const lookup = (id: TaskId) => graph.entry(id)?.task;
    const dependencyEdges: TaskMapDependencyEdge[] = [];
    for (const item of relations.tasks) {
      const to = item.task.id;
      if (!shown.has(to)) continue;
      for (const relation of relations.waitsFor(to)) {
        if (relation.kind !== "dependency") continue;
        const from = relation.waitingFor;
        if (!shown.has(from)) continue;
        dependencyEdges.push({
          from,
          to,
          any: item.task.dependencyMode === "any",
          conflict: dependencyConflicts(item.task, from, lookup),
          cycle: cycles.get(to)?.includes(from) ?? false,
        });
      }
    }
    return { areas, sequenceEdges, dependencyEdges };
  };
}
