// The task graph (GLOSSARY: 下一步行动, 阻塞, 搁置子树, 开始日期): which tasks
// are next actions, given every task with its parent task and its place in
// the notes. Pure; `today` is the current logical day, computed by the caller.
import { owningProject, type ProjectSetting } from "../project/ownership";
import {
  type Project,
  type ProjectId,
  projectAllowsNextAction,
} from "../project/project";
import type {
  CompletionEntry,
  CompletionHistory,
} from "../task/completion-history";
import type { MyDayRead } from "../task/my-day";
import type {
  AncestorRatings,
  CalendarDate,
  DependencyMode,
  Task,
  TaskId,
  TaskStatus,
} from "../task/task";
import { addDays, compareDays } from "../time/calendar-days";
import { dependencyCyclesIn } from "./dependency-cycles";
import { buildTaskRelations } from "./task-relations";

/** A task with where it sits among the others (ADR 0003). */
export interface SnapshotTask {
  readonly task: Task;
  /** Its nearest task ancestor, `null` when it has none. */
  readonly parentId: TaskId | null;
  /** Its place in the notes (document preorder): lower comes first. */
  readonly position: number;
  /**
   * The last completion of its completion history (GLOSSARY: 完成历史),
   * skips passed over (#91); absent when it has none, or the history cannot
   * be read.
   */
  readonly lastCompletion?: CompletionEntry;
  /**
   * The last skip of its completion history (GLOSSARY: 跳过, #91), for My
   * Day's "skipped today"; absent when it has none, or the history cannot be
   * read.
   */
  readonly lastSkip?: CompletionEntry;
  /**
   * Its whole completion history (GLOSSARY: 完成历史), oldest first, for the
   * review's look back (GLOSSARY: 回看过去, #102); absent when it has none,
   * or the history cannot be read.
   */
  readonly completionHistory?: CompletionHistory;
  /**
   * Its My Day entries (GLOSSARY: 我的一天记录), every logical day's; absent
   * when it has none. Unreadable ones are marked so, not read as none.
   */
  readonly myDay?: MyDayRead;
  /** Its block is a page: it has an alias. Absent when it is not. */
  readonly page?: boolean;
  /**
   * Its block has no parent block: a page at the top of the notes. A block
   * placed before or after it has none either (move-blocks P2). Absent when
   * it has one.
   */
  readonly root?: boolean;
  /**
   * Its nearest project block in the block hierarchy (GLOSSARY: 所属项目),
   * the block itself not counting: a block that is both a task and a project
   * is not its own task's project. Absent when no ancestor block is one.
   */
  readonly projectBlock?: ProjectId;
  /**
   * Its own 所属项目 setting (GLOSSARY: 所属项目), the first value only;
   * absent when it has none. A stale one is kept, as read.
   */
  readonly projectSetting?: ProjectSetting;
}

/** A project with where it sits in the notes (GLOSSARY: 项目). */
export interface SnapshotProject {
  readonly project: Project;
  /** Its place in the notes (document preorder), as a task's. */
  readonly position: number;
  /** Its block is a page: it has an alias. Absent when it is not. */
  readonly page?: boolean;
  /**
   * Its block's nearest task ancestor, the block itself not counting (ADR
   * 0025 lets a project block sit below a task; #170). Absent for none.
   */
  readonly parentId?: TaskId;
  /**
   * Its block's nearest ancestor among the project blocks, the block itself
   * not counting. Absent for none.
   */
  readonly projectBlock?: ProjectId;
}

/** Every task, done ones included, as they stand in the notes. */
export interface TaskGraphSnapshot {
  readonly tasks: readonly SnapshotTask[];
  /**
   * Every project (ADR 0025); absent or empty when there is none, or while
   * the project tag is paused: then no task belongs to a project.
   */
  readonly projects?: readonly SnapshotProject[];
  /**
   * The project tag is paused (#143): no project, and no task holds a
   * project block or a 所属项目 setting, so none reads as stale. Absent when
   * it is not.
   */
  readonly projectsPaused?: boolean;
}

export interface TaskGraphOptions {
  /** The current logical day. */
  readonly today: CalendarDate;
  /**
   * How many days ahead an effective start may lie for the task to be a next
   * action already (the start preview setting); 0 for none.
   */
  readonly previewDays: number;
}

/**
 * Why a task is blocked (GLOSSARY: 阻塞), one entry per cause. Every kind
 * says which task the blocking comes from and which tasks it waits for, so
 * the task panel shows any kind the same way (#54); later kinds (dependency,
 * sequential, cycle) are added to the union.
 *
 * - `subtasks` (子任务阻塞): direct subtasks neither done nor someday. Not
 *   passed down, so its source is always the task itself.
 * - `sequential` (顺序阻塞): under a sequential parent, earlier sibling
 *   subtasks neither done nor someday. `source` is the sibling held back:
 *   the task itself, or an ancestor task for blocking passed down (ADR
 *   0015); `waitingFor` are its earlier siblings.
 * - `cycle` (循环依赖): the task is on a dependency cycle (#60). `source` is
 *   the task itself; `waitingFor` are the tasks on the cycle it waits for
 *   directly, in note order.
 */
export type BlockingReason =
  | (BlockingReasonBase & {
      readonly kind: "subtasks" | "sequential" | "cycle";
    })
  | (BlockingReasonBase & {
      readonly kind: "dependencies";
      /**
       * The source's dependency mode (GLOSSARY: 依赖模式): in mode "any" it
       * waits for every one listed, and one of them done is enough (#58).
       */
      readonly mode: DependencyMode;
    })
  | (BlockingReasonBase & {
      /**
       * 依赖延迟 (#77): the source's dependencies are met, but its dependency
       * delay has not passed. It waits for no task (`waitingFor` is empty),
       * only for `releasedOn`.
       */
      readonly kind: "dependencyDelay";
      /** The dependency whose completion the delay counts from. */
      readonly countedFrom: TaskId;
      /** The first logical day the source is let in: completion + delay. */
      readonly releasedOn: CalendarDate;
    });

interface BlockingReasonBase {
  /**
   * The task the blocking comes from: the task itself, or an ancestor task
   * for blocking passed down (ADR 0015).
   */
  readonly source: TaskId;
  /** The tasks it waits for, in note order. */
  readonly waitingFor: readonly TaskId[];
}

/** What the graph says about one task. */
export interface TaskGraphEntry {
  readonly task: Task;
  readonly parentId: TaskId | null;
  /** Empty when nothing blocks it. */
  readonly blockedBy: readonly BlockingReason[];
  /**
   * In a parked subtree (GLOSSARY: 搁置子树): it or an ancestor task is
   * waiting or someday.
   */
  readonly parked: boolean;
  /**
   * The nearest task that parks it (GLOSSARY: 搁置子树): the task itself or
   * an ancestor task, waiting or someday; `null` when it is not parked.
   */
  readonly parkedBy: TaskId | null;
  /**
   * The nearest done ancestor task (GLOSSARY: 下一步行动, ADR 0017): with
   * one, at any level, the whole branch below it is out of the next actions;
   * `null` when no ancestor task is done. The task itself does not count.
   */
  readonly doneAncestor: TaskId | null;
  /**
   * The project the task belongs to (GLOSSARY: 所属项目), `null` for none.
   * Its constraints keep the task out of the next actions but are no
   * blocking: they are not in `blockedBy`.
   */
  readonly project: Project | null;
  /**
   * The latest start among the task, all its ancestor tasks and its project
   * (GLOSSARY: 开始日期, ADR 0015); `null` when none has one.
   */
  readonly effectiveStart: CalendarDate | null;
  /**
   * The task whose start the effective start is: the task itself or an
   * ancestor task, the nearest one when several share that day; `null` when
   * none has a start, or when it is the project's (`startFromProject`).
   */
  readonly effectiveStartFrom: TaskId | null;
  /**
   * The effective start is the project's start: later than every start of
   * the task and its ancestor tasks.
   */
  readonly startFromProject: boolean;
  /**
   * The effective start lets the task in (GLOSSARY: 开始日期): there is none,
   * or it lies no later than today plus the start preview days.
   */
  readonly started: boolean;
  /**
   * The importance and urgency of each ancestor task, nearest first, then of
   * its project, whatever their status: what the score inherits (GLOSSARY:
   * 评分, ADR 0019). Empty for a task without either.
   */
  readonly ancestorRatings: readonly AncestorRatings[];
  readonly nextAction: boolean;
}

export interface TaskGraph {
  /** The next actions, in no particular order. */
  readonly nextActions: readonly TaskGraphEntry[];
  /** What the graph says about a task, `undefined` when it is not one. */
  entry(id: TaskId): TaskGraphEntry | undefined;
}

/**
 * Only a task to do or in progress can be a next action (GLOSSARY: 下一步行
 * 动); one in any other status is not, whatever else holds.
 */
export function statusAllowsNextAction(status: TaskStatus): boolean {
  return status === "todo" || status === "doing";
}

/** A subtask in these statuses does not hold its parent back. */
function releasesParent(task: Task): boolean {
  return task.status === "done" || task.status === "someday";
}

/** A task in these statuses parks itself and everything below it. */
function parks(task: Task): boolean {
  return task.status === "waiting" || task.status === "someday";
}

export function analyzeTaskGraph(
  snapshot: TaskGraphSnapshot,
  options: TaskGraphOptions,
): TaskGraph {
  /** The last effective start that still lets a task in. */
  const startsBy = addDays(options.today, options.previewDays);
  const relations = buildTaskRelations(snapshot.tasks);
  /** The task and its ancestor tasks, nearest first. */
  const selfAndAncestors = (item: SnapshotTask): SnapshotTask[] => [
    item,
    ...relations.ancestorsOf(item.task.id),
  ];

  /**
   * Under a sequential parent, the earlier sibling subtasks (note order) that
   * hold `item` back: neither done nor someday (GLOSSARY: 顺序执行). Empty
   * when its parent task is not sequential.
   */
  const earlierOpenSiblings = (item: SnapshotTask): TaskId[] => {
    const parent = relations.parentOf(item.task.id);
    if (!parent?.task.sequential) return [];
    return relations
      .childrenOf(parent.task.id)
      .filter(
        (sibling) =>
          sibling.position < item.position && !releasesParent(sibling.task),
      )
      .map((sibling) => sibling.task.id);
  };

  /**
   * The dependencies of `item` not yet met (GLOSSARY: 依赖), in the order
   * the notes hold them. A dependency is met when its target is done; a
   * target that is not a task in the snapshot is a stale dependency and
   * counts as met. In mode "all" every dependency must be met; in mode "any"
   * (GLOSSARY: 依赖模式) one met dependency, stale ones included, is enough,
   * and none is listed then.
   */
  const unmetDependencies = (item: SnapshotTask): TaskId[] => {
    const unmet = item.task.dependencies.filter((target) => {
      const dependency = relations.get(target);
      return dependency !== undefined && dependency.task.status !== "done";
    });
    const someMet = unmet.length < item.task.dependencies.length;
    return item.task.dependencyMode === "any" && someMet ? [] : unmet;
  };

  /**
   * When `item`'s dependency delay (GLOSSARY: 依赖延迟) lets it in, once its
   * dependencies are met: the release day and the dependency it counts from,
   * or `undefined` when nothing holds it. Counts from the latest completion
   * among the dependencies met in mode "all", from the earliest in mode
   * "any": the logical day of its last completion record. A met dependency
   * without one (done outside the plugin, or stale) counts as done long ago:
   * left out in mode "all", and in mode "any" it lets the task in at once
   * (ADR 0018).
   */
  const delayRelease = (
    item: SnapshotTask,
  ): { releasedOn: CalendarDate; countedFrom: TaskId } | undefined => {
    if (item.task.dependencyDelay <= 0) return undefined;
    /** Whether `day` replaces `than` as the day the delay counts from. */
    const replaces =
      item.task.dependencyMode === "any"
        ? (day: CalendarDate, than: CalendarDate) => compareDays(day, than) < 0
        : (day: CalendarDate, than: CalendarDate) => compareDays(day, than) > 0;
    let from: { day: CalendarDate; id: TaskId } | undefined;
    for (const target of item.task.dependencies) {
      const dependency = relations.get(target);
      // Not met: a record from before it was reopened does not count.
      if (dependency && dependency.task.status !== "done") continue;
      const day = dependency?.lastCompletion?.day;
      if (day === undefined) {
        if (item.task.dependencyMode === "any") return undefined;
        continue;
      }
      if (from === undefined || replaces(day, from.day)) {
        from = { day, id: target };
      }
    }
    if (from === undefined) return undefined;
    return {
      releasedOn: addDays(from.day, item.task.dependencyDelay),
      countedFrom: from.id,
    };
  };

  const cycles = dependencyCyclesIn(relations);
  const projects = new Map(
    (snapshot.projects ?? []).map((item) => [item.project.id, item.project]),
  );

  const entries = new Map<TaskId, TaskGraphEntry>();
  for (const item of relations.tasks) {
    const blockedBy: BlockingReason[] = [];
    const waitingFor = relations
      .childrenOf(item.task.id)
      .filter((child) => !releasesParent(child.task))
      .map((child) => child.task.id);
    if (waitingFor.length > 0) {
      blockedBy.push({ kind: "subtasks", source: item.task.id, waitingFor });
    }
    const chain = selfAndAncestors(item);
    // Dependency blocking of the task or any ancestor task passes down (ADR
    // 0015): one reason per link whose dependencies are unmet, nearest first.
    for (const link of chain) {
      const waitingFor = unmetDependencies(link);
      if (waitingFor.length > 0) {
        blockedBy.push({
          kind: "dependencies",
          source: link.task.id,
          waitingFor,
          mode: link.task.dependencyMode,
        });
        continue;
      }
      // Met, but the delay has not passed yet (#77).
      const release = delayRelease(link);
      if (release && compareDays(options.today, release.releasedOn) < 0) {
        blockedBy.push({
          kind: "dependencyDelay",
          source: link.task.id,
          waitingFor: [],
          ...release,
        });
      }
    }
    // Sequential blocking of the task or any ancestor task passes down (ADR
    // 0015): one reason per link held back, nearest first.
    for (const link of chain) {
      const waitingFor = earlierOpenSiblings(link);
      if (waitingFor.length > 0) {
        blockedBy.push({
          kind: "sequential",
          source: link.task.id,
          waitingFor,
        });
      }
    }
    const onCycle = cycles.get(item.task.id);
    if (onCycle) {
      blockedBy.push({
        kind: "cycle",
        source: item.task.id,
        waitingFor: onCycle,
      });
    }
    const parkedBy = chain.find((link) => parks(link.task))?.task.id ?? null;
    const parked = parkedBy !== null;
    // A done ancestor task at any level takes the branch out (ADR 0017).
    const doneAncestor =
      chain.slice(1).find((link) => link.task.status === "done")?.task.id ??
      null;
    // Nearest first, so only a strictly later start replaces it.
    let startLink: SnapshotTask | undefined;
    for (const link of chain) {
      const start = link.task.start;
      if (start === null) continue;
      if (
        !startLink?.task.start ||
        compareDays(start, startLink.task.start) > 0
      ) {
        startLink = link;
      }
    }
    const projectId = owningProject(chain, (id) => projects.has(id));
    const project =
      projectId === null ? null : (projects.get(projectId) ?? null);
    const taskStart = startLink?.task.start ?? null;
    // Beyond the top ancestor task: only a strictly later start is its.
    const projectStart = project?.start ?? null;
    const startFromProject =
      projectStart !== null &&
      (taskStart === null || compareDays(projectStart, taskStart) > 0);
    const effectiveStart = startFromProject ? projectStart : taskStart;
    const started =
      effectiveStart === null || compareDays(effectiveStart, startsBy) <= 0;
    entries.set(item.task.id, {
      task: item.task,
      parentId: item.parentId,
      blockedBy,
      parked,
      parkedBy,
      doneAncestor,
      project,
      effectiveStart,
      effectiveStartFrom: startFromProject
        ? null
        : (startLink?.task.id ?? null),
      startFromProject,
      started,
      ancestorRatings: [
        ...chain.slice(1).map((link) => link.task),
        ...(project ? [project] : []),
      ].map(({ importance, urgency }) => ({ importance, urgency })),
      nextAction:
        statusAllowsNextAction(item.task.status) &&
        blockedBy.length === 0 &&
        !parked &&
        doneAncestor === null &&
        started &&
        (project === null || projectAllowsNextAction(project.status)),
    });
  }

  const all = [...entries.values()];
  return {
    nextActions: all.filter((entry) => entry.nextAction),
    entry: (id) => entries.get(id),
  };
}
