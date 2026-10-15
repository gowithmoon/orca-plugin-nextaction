// 所属项目 (GLOSSARY, ADR 0025): which project a task belongs to, at most
// one. Parent task first: going down from the top task, the first task with
// an ownership decides for itself and every descendant task. A task's own
// ownership is its set project, or else its nearest project block. Pure.
import type { TaskId } from "../task/task";
import type { ProjectId } from "./project";

/**
 * A task's own 所属项目 setting: the first value of the property, as read
 * (a second value is ignored, ADR 0025).
 */
export interface ProjectSetting {
  /** The reference ID the value holds, for writing it again or clearing it. */
  readonly refId: number;
  /**
   * The block the reference points at; `null` when the block has no such
   * reference. Either way it counts only while it is a project (stale
   * otherwise).
   */
  readonly target: ProjectId | null;
}

/** What one task in a chain says about its own ownership. */
export interface OwnershipLink {
  readonly task: { readonly id: TaskId };
  /** Its own 所属项目 setting; absent when it has none. */
  readonly projectSetting?: ProjectSetting;
  /**
   * Its nearest project block in the block hierarchy, itself not counting
   * (a block that is both is not its own task's project); absent for none.
   */
  readonly projectBlock?: ProjectId;
}

/**
 * The project a task's own ownership names, or `null` for none: its set
 * project, unless that is stale, else its nearest project block. A block
 * that is both a task and a project is not its own task's project, set or
 * not.
 */
function ownProject(
  link: OwnershipLink,
  isProject: (id: ProjectId) => boolean,
): { project: ProjectId; by: "setting" | "block" } | null {
  const set = link.projectSetting?.target ?? null;
  if (set !== null && settingCounts(link, isProject)) {
    return { project: set, by: "setting" };
  }
  const block = link.projectBlock;
  return block !== undefined && isProject(block)
    ? { project: block, by: "block" }
    : null;
}

/**
 * The link's own 所属项目 setting names a project: not stale (GLOSSARY: 所属
 * 项目), and not the task's own block.
 */
export function settingCounts(
  link: OwnershipLink,
  isProject: (id: ProjectId) => boolean,
): boolean {
  const set = link.projectSetting?.target ?? null;
  return set !== null && set !== link.task.id && isProject(set);
}

/** Which link decided a task's project, and how (#146). */
export interface OwnershipDecision {
  readonly project: ProjectId;
  /** Its index in the chain given: 0 is the task itself. */
  readonly link: number;
  /** The link's own setting, or its nearest project block. */
  readonly by: "setting" | "block";
}

/**
 * As `owningProject`, saying which link decided and how; `null` for none.
 */
export function ownershipDecision(
  selfAndAncestors: readonly OwnershipLink[],
  isProject: (id: ProjectId) => boolean,
): OwnershipDecision | null {
  // The top task first: the first ownership found decides the branch.
  for (let i = selfAndAncestors.length - 1; i >= 0; i--) {
    const link = selfAndAncestors[i];
    const own = link ? ownProject(link, isProject) : null;
    if (own !== null) return { ...own, link: i };
  }
  return null;
}

/**
 * The project a task belongs to, given it and its ancestor tasks, nearest
 * first, or `null` for none. Only projects `isProject` knows count: a block
 * that is no longer a project is no ownership.
 */
export function owningProject(
  selfAndAncestors: readonly OwnershipLink[],
  isProject: (id: ProjectId) => boolean,
): ProjectId | null {
  return ownershipDecision(selfAndAncestors, isProject)?.project ?? null;
}
