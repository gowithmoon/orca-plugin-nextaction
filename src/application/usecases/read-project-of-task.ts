// Use case: what the task panel's 所属项目 field shows (#146, GLOSSARY: 所属
// 项目, ADR 0025): the project the task belongs to, where that comes from, and
// the task's own setting when it does not count (overridden by a parent task,
// or stale). Nothing is written: a stale setting is cleared only by the next
// edit (ADR 0016).
import type { SnapshotTask } from "../../domain/blocking/task-graph";
import {
  ownershipDecision,
  settingCounts,
} from "../../domain/project/ownership";
import type { ProjectId, ProjectStatus } from "../../domain/project/project";
import type { TaskId } from "../../domain/task/task";
import type { TaskRepository } from "../ports/task-repository";

/** A project as the field shows it. */
export interface ProjectShown {
  readonly id: ProjectId;
  /** As the notes hold it; may be empty. */
  readonly text: string;
  readonly status: ProjectStatus;
}

/**
 * Where the task's project comes from.
 *
 * - `own`: its own setting.
 * - `location`: its nearest project block; setting one of its own changes it.
 * - `parentTask`: an ancestor task's ownership decides the branch (by its
 *   setting, or its nearest project block, the task's too or not); `task`
 *   is that ancestor. Read only: the task's own setting would not count.
 */
export type ProjectOfTaskSource =
  | { readonly kind: "own" | "location" }
  | {
      readonly kind: "parentTask";
      readonly task: { readonly id: TaskId; readonly text: string };
    };

/**
 * The task's own setting when it does not decide: `overridden` names a
 * project but an ancestor task decides (GLOSSARY: 所属项目, "不生效");
 * `stale` names a block that is no longer a project (as a stale dependency,
 * "已失效"). Either can be removed.
 */
export type OwnSettingShown =
  | { readonly kind: "overridden"; readonly project: ProjectShown }
  | { readonly kind: "stale" };

export interface ProjectOfTaskRead {
  /** `null` when the task belongs to no project, or is not a task. */
  readonly project: ProjectShown | null;
  /** `null` exactly when `project` is. */
  readonly source: ProjectOfTaskSource | null;
  /** `null` when the task has no setting of its own, or it decides. */
  readonly ownSetting: OwnSettingShown | null;
  /**
   * The project tag is paused (US103): the task belongs to no project and
   * nothing can be set or cleared. Absent when it is not.
   */
  readonly projectsPaused?: true;
}

/** Reads the 所属项目 of task `id`, from one read. Errors are thrown as they are. */
export type ReadProjectOfTask = (id: TaskId) => Promise<ProjectOfTaskRead>;

export function createReadProjectOfTask(deps: {
  repository: TaskRepository;
}): ReadProjectOfTask {
  return async (id) => {
    const snapshot = await deps.repository.readTaskGraph();
    if (snapshot.projectsPaused) {
      return {
        project: null,
        source: null,
        ownSetting: null,
        projectsPaused: true,
      };
    }
    const tasks = new Map(snapshot.tasks.map((item) => [item.task.id, item]));
    const projects = new Map(
      (snapshot.projects ?? []).map(({ project }) => [
        project.id,
        { id: project.id, text: project.text, status: project.status },
      ]),
    );
    const isProject = (target: ProjectId) => projects.has(target);
    const self = tasks.get(id);
    if (!self) return { project: null, source: null, ownSetting: null };
    // The task and its ancestor tasks, nearest first.
    const chain: SnapshotTask[] = [self];
    const seen = new Set([id]);
    for (let at = self.parentId; at !== null && !seen.has(at); ) {
      const link = tasks.get(at);
      if (!link) break;
      chain.push(link);
      seen.add(at);
      at = link.parentId;
    }
    const decision = ownershipDecision(chain, isProject);
    const project =
      decision === null ? null : (projects.get(decision.project) ?? null);
    let source: ProjectOfTaskSource | null = null;
    if (decision !== null) {
      const decider = chain[decision.link];
      // An ancestor task decides even when it is by a project block the task
      // sits in too: the task's own setting would not count (US18, US90).
      source =
        decision.link === 0
          ? { kind: decision.by === "setting" ? "own" : "location" }
          : {
              kind: "parentTask",
              task: {
                id: decider?.task.id ?? id,
                text: decider?.task.text ?? "",
              },
            };
    }
    let ownSetting: OwnSettingShown | null = null;
    const target = self.projectSetting?.target ?? null;
    if (self.projectSetting && !settingCounts(self, isProject)) {
      ownSetting = { kind: "stale" };
    } else if (target !== null && source?.kind === "parentTask") {
      const overridden = projects.get(target);
      if (overridden) ownSetting = { kind: "overridden", project: overridden };
    }
    return { project, source, ownSetting };
  };
}
