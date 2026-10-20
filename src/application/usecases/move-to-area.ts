// Use case: a task dropped on the task map's empty space of a project's box,
// or of the no-project area (#222), so it belongs to that project, or to
// none (GLOSSARY: 所属项目). Two steps: what can be done (`ReadMoveToArea`),
// then doing the one chosen (`MoveToArea`), in one undo.
import type {
  SnapshotTask,
  TaskGraphSnapshot,
} from "../../domain/blocking/task-graph";
import { movedSnapshot } from "../../domain/blocking/task-move";
import { buildTaskRelations } from "../../domain/blocking/task-relations";
import {
  ownershipDecision,
  settingCounts,
} from "../../domain/project/ownership";
import type { ProjectId } from "../../domain/project/project";
import type { TaskId } from "../../domain/task/task";
import type { Clock } from "../ports/clock";
import type { TaskRepository } from "../ports/task-repository";
import { checkMove } from "./move-task";

/** Where the task was dropped: a project's box, or the no-project area. */
export type MoveToAreaTarget =
  | { readonly kind: "project"; readonly project: ProjectId }
  | { readonly kind: "noProject" };

/** Why a way of making the task belong to the project cannot be taken. */
export type MoveToAreaInfeasibility =
  /**
   * An ancestor task's ownership decides, before or after the move: the
   * task would not belong to the project.
   */
  | {
      readonly kind: "decidedByParentTask";
      readonly task: { readonly id: TaskId; readonly text: string };
    }
  /** The project's block is the task's or below it. */
  | { readonly kind: "ontoSelf" }
  /** The move would make a dependency cycle with `task` (ADR 0015). */
  | {
      readonly kind: "cycle";
      readonly task: { readonly id: TaskId; readonly text: string };
    };

/** One way of making the task belong to the project. */
export type MoveToAreaOption =
  | { readonly feasible: true }
  | { readonly feasible: false; readonly reason: MoveToAreaInfeasibility };

/**
 * Moving the task's block to the end of the project's block; its own
 * setting of another project, if any, is cleared with it (`clearsOwnSetting`).
 */
export type MoveUnderProjectOption =
  | { readonly feasible: true; readonly clearsOwnSetting: boolean }
  | { readonly feasible: false; readonly reason: MoveToAreaInfeasibility };

/** What dropping the task on `target` can do. */
export type MoveToAreaPlan =
  /** It already belongs there: nothing is written. */
  | { readonly kind: "nothing" }
  /**
   * The no-project area, decided by how the task belongs now, nothing to
   * choose: its own setting cleared, its block moved to the end of today's
   * journal, or both, at least one.
   */
  | {
      readonly kind: "leave";
      readonly clearsOwnSetting: boolean;
      readonly toJournal: boolean;
    }
  | {
      readonly kind: "choose";
      readonly moveUnderProject: MoveUnderProjectOption;
      readonly setProjectOnly: MoveToAreaOption;
    };

export type ReadMoveToArea = (
  id: TaskId,
  target: MoveToAreaTarget,
) => Promise<MoveToAreaPlan>;

export function planMoveToArea(
  snapshot: TaskGraphSnapshot,
  id: TaskId,
  target: MoveToAreaTarget,
): MoveToAreaPlan {
  const isProject = (project: ProjectId) =>
    (snapshot.projects ?? []).some((entry) => entry.project.id === project);
  const self = snapshot.tasks.find((item) => item.task.id === id);
  const project = target.kind === "project" ? target.project : null;
  const clearsOwnSetting =
    self !== undefined &&
    settingCounts(self, isProject) &&
    self.projectSetting?.target !== project;
  // Its ancestor tasks, nearest first: the first ownership from the top
  // decides the branch, the task's own setting then not counting.
  const ancestors = buildTaskRelations(snapshot.tasks).ancestorsOf(id);
  const owner = self
    ? (ownershipDecision([self, ...ancestors], isProject)?.project ?? null)
    : null;
  if (!self || owner === project) return { kind: "nothing" };
  if (project === null) {
    // Its own setting would count again in the journal, so it goes either
    // way; it still belongs to a project without it (its project block, or
    // an ancestor task deciding): to the journal, with no parent task.
    const ownSetting = settingCounts(self, isProject);
    const { projectSetting: _cleared, ...withoutSetting } = self;
    const stillOwned =
      ownershipDecision([withoutSetting, ...ancestors], isProject) !== null;
    return {
      kind: "leave",
      clearsOwnSetting: ownSetting,
      toJournal: stillOwned,
    };
  }
  const decider = deciderAbove(ancestors, isProject);
  // A block that is both is not its own task's project (ADR 0025).
  const setProjectOnly: MoveToAreaOption =
    project === id
      ? { feasible: false, reason: { kind: "ontoSelf" } }
      : decider
        ? {
            feasible: false,
            reason: { kind: "decidedByParentTask", task: decider },
          }
        : { feasible: true };
  return {
    kind: "choose",
    moveUnderProject: moveUnderProject(snapshot, id, project, clearsOwnSetting),
    setProjectOnly,
  };
}

type TaskNamed = { readonly id: TaskId; readonly text: string };

/** The ancestor task whose ownership decides the branch, or `undefined`. */
function deciderAbove(
  ancestors: readonly SnapshotTask[],
  isProject: (id: ProjectId) => boolean,
): TaskNamed | undefined {
  const decision = ownershipDecision(ancestors, isProject);
  const decider = decision ? ancestors[decision.link] : undefined;
  return decider && { id: decider.task.id, text: decider.task.text };
}

/**
 * Whether moving task `id` to the end of `project`'s block makes it belong
 * to it, its own setting cleared: checked as the move use case checks the
 * move, then by the ownership on the snapshot as it would stand afterwards.
 */
function moveUnderProject(
  snapshot: TaskGraphSnapshot,
  id: TaskId,
  project: ProjectId,
  clearsOwnSetting: boolean,
): MoveUnderProjectOption {
  const text = (task: TaskId) =>
    snapshot.tasks.find((item) => item.task.id === task)?.task.text ?? "";
  const move = { id, projectEnd: project };
  const check = checkMove(snapshot, move);
  if (check.kind === "refused") {
    return { feasible: false, reason: { kind: "ontoSelf" } };
  }
  if (check.kind === "cycle") {
    return {
      feasible: false,
      reason: {
        kind: "cycle",
        task: { id: check.cycleWith, text: text(check.cycleWith) },
      },
    };
  }
  const after =
    check.kind === "inPlace" ? snapshot : movedSnapshot(snapshot, move);
  const isProject = (block: ProjectId) =>
    (snapshot.projects ?? []).some((entry) => entry.project.id === block);
  const relations = buildTaskRelations(after?.tasks ?? []);
  const moved = relations.get(id);
  if (!moved) return { feasible: false, reason: { kind: "ontoSelf" } };
  const { projectSetting: _cleared, ...withoutSetting } = moved;
  const ancestors = relations.ancestorsOf(id);
  const self = clearsOwnSetting ? withoutSetting : moved;
  if (ownershipDecision([self, ...ancestors], isProject)?.project === project) {
    return { feasible: true, clearsOwnSetting };
  }
  const decider = deciderAbove(ancestors, isProject);
  return decider
    ? {
        feasible: false,
        reason: { kind: "decidedByParentTask", task: decider },
      }
    : { feasible: false, reason: { kind: "ontoSelf" } };
}

export function createReadMoveToArea(deps: {
  repository: TaskRepository;
}): ReadMoveToArea {
  return async (id, target) =>
    planMoveToArea(await deps.repository.readTaskGraph(), id, target);
}

/** The way chosen for a project's box; the no-project area takes none. */
export type MoveToAreaChoice = "moveUnderProject" | "setProjectOnly";

/** The way chosen cannot be taken (any more): nothing was written. */
export class MoveToAreaInfeasibleError extends Error {
  override name = "MoveToAreaInfeasibleError";

  constructor(readonly reason: MoveToAreaInfeasibility) {
    super("The move to the area cannot be done");
  }
}

/**
 * Makes task `id` belong to `target`'s project, or to none, as read afresh:
 * by `choice` for a project's box, by how it belongs now for the no-project
 * area. One undo; nothing written when it already belongs there. Fails,
 * writing nothing, with `MoveToAreaInfeasibleError` when the choice cannot
 * be taken. Other errors are thrown as they are.
 */
export type MoveToArea = (
  id: TaskId,
  target: MoveToAreaTarget,
  choice?: MoveToAreaChoice,
) => Promise<void>;

export function createMoveToArea(deps: {
  repository: TaskRepository;
  clock: Clock;
}): MoveToArea {
  return async (id, target, choice) => {
    const plan = planMoveToArea(
      await deps.repository.readTaskGraph(),
      id,
      target,
    );
    if (plan.kind === "nothing") return;
    if (plan.kind === "leave") {
      const options = { clearProject: plan.clearsOwnSetting };
      if (plan.toJournal) {
        await deps.repository.moveTaskToJournal(id, deps.clock.now(), options);
      } else {
        await deps.repository.updateTask(id, { changes: { project: null } });
      }
      return;
    }
    if (target.kind !== "project") return;
    const option =
      choice === "setProjectOnly" ? plan.setProjectOnly : plan.moveUnderProject;
    if (!option.feasible) throw new MoveToAreaInfeasibleError(option.reason);
    if (choice === "setProjectOnly") {
      await deps.repository.updateTask(id, {
        changes: { project: target.project },
      });
      return;
    }
    await deps.repository.moveTaskToProjectEnd(id, target.project, {
      clearProject: plan.moveUnderProject.feasible
        ? plan.moveUnderProject.clearsOwnSetting
        : false,
    });
  };
}
