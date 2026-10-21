// The task graph snapshot, put together from blocks already read: the I/O
// stays in the repository, the placing and decoding of what the blocks carry
// is here. Pure, tested against get-blocks shaped blocks.
import type {
  SnapshotProject,
  SnapshotTask,
  TaskGraphSnapshot,
} from "../../../domain/blocking/task-graph";
import type { ProjectSetting } from "../../../domain/project/ownership";
import type { Project } from "../../../domain/project/project";
import {
  lastCompletion as lastCompletionIn,
  lastSkip as lastSkipIn,
} from "../../../domain/task/completion-history";
import type { MyDayRead } from "../../../domain/task/my-day";
import type { Task } from "../../../domain/task/task";
import { readCompletionHistory } from "../codec/completion-history-codec";
import { readMyDay } from "../codec/my-day-codec";
import type { BlockWithProperties } from "../codec/plugin-block-property-codec";
import { type HierarchyBlock, placeTasks } from "./task-hierarchy";

/** What the snapshot reads of a task block. */
export interface SnapshotTaskBlock extends HierarchyBlock, BlockWithProperties {
  readonly aliases: readonly string[];
}

/** What the snapshot reads of a project block. */
export interface SnapshotProjectBlock {
  readonly aliases: readonly string[];
}

export interface SnapshotParts {
  /** The decoded tasks, in query order, their dependencies resolved. */
  readonly tasks: readonly Task[];
  /** The task blocks, by ID. */
  readonly taskBlocks: ReadonlyMap<number, SnapshotTaskBlock>;
  readonly projects: readonly Project[];
  /** The project blocks, by ID. */
  readonly projectBlocks: ReadonlyMap<number, SnapshotProjectBlock>;
  /**
   * Every block on the way up from the tasks and the projects: the task and
   * project blocks, and their ancestors read layer by layer.
   */
  readonly hierarchy: ReadonlyMap<number, HierarchyBlock>;
  /** Each task's own 所属项目 setting; none while projects are paused. */
  readonly projectSettings: ReadonlyMap<number, ProjectSetting>;
  readonly projectsPaused?: boolean;
}

/**
 * A block's My Day entries as the port reads them; `undefined` when it holds
 * none, so a snapshot task carries nothing.
 */
export function myDayOf(block: BlockWithProperties): MyDayRead | undefined {
  const read = readMyDay(block);
  if (read.kind === "unreadable") {
    return { kind: "unreadable", reason: read.reason };
  }
  return read.entries.length > 0 ? read : undefined;
}

/**
 * The snapshot of `parts`: every task and project placed in the notes
 * (`placeTasks`), each task with what its block carries. With no task, the
 * projects are placed all the same.
 */
export function taskGraphSnapshot(parts: SnapshotParts): TaskGraphSnapshot {
  const places = placeTasks(
    parts.tasks.map((task) => task.id),
    parts.hierarchy,
    parts.projects.map((project) => project.id),
  );
  const projects = parts.projects.map((project): SnapshotProject => {
    const block = parts.projectBlocks.get(project.id);
    const place = places.get(project.id);
    return {
      project,
      position: place?.position ?? Number.MAX_SAFE_INTEGER,
      ...(block && block.aliases.length > 0 && { page: true }),
      // A project block may sit below a task (ADR 0025, #170).
      ...(place?.parentId != null && { parentId: place.parentId }),
      ...(place?.projectBlock !== undefined && {
        projectBlock: place.projectBlock,
      }),
    };
  });
  const tasks = parts.tasks.map((task): SnapshotTask => {
    const place = places.get(task.id);
    // The last completion (skips passed over, #91), from the block already
    // read. An unreadable history reads as none here, without a warning on
    // every read; it is reported where it is read for writing
    // (readCompletionHistory).
    const block = parts.taskBlocks.get(task.id);
    const history = block ? readCompletionHistory(block) : undefined;
    const lastCompletion =
      history?.kind === "readable"
        ? lastCompletionIn(history.history)
        : undefined;
    const lastSkip =
      history?.kind === "readable" ? lastSkipIn(history.history) : undefined;
    // The My Day entries, from the same block. Unreadable ones are marked so,
    // without a warning on every read; readMyDay warns when they are read by
    // ID.
    const myDay = block ? myDayOf(block) : undefined;
    const projectSetting = parts.projectSettings.get(task.id);
    return {
      task,
      parentId: place?.parentId ?? null,
      position: place?.position ?? Number.MAX_SAFE_INTEGER,
      ...(lastCompletion && { lastCompletion }),
      ...(lastSkip && { lastSkip }),
      // The whole history, for the review's look back (#102).
      ...(history?.kind === "readable" &&
        history.history.length > 0 && {
          completionHistory: history.history,
        }),
      ...(myDay && { myDay }),
      // A page has an alias; with no parent block it sits at the top of the
      // notes, where only pages are tasks (ADR 0013, move-blocks P2).
      ...(block && block.aliases.length > 0 && { page: true }),
      ...(block && block.parent == null && { root: true }),
      ...(place?.projectBlock !== undefined && {
        projectBlock: place.projectBlock,
      }),
      // Stale or not, as read; the task graph decides whether it counts.
      ...(projectSetting && { projectSetting }),
    };
  });
  return {
    ...(parts.projectsPaused && { projectsPaused: true }),
    projects,
    tasks,
  };
}
