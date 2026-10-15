// 所属项目 (GLOSSARY, ADR 0025): which project a task belongs to, at most
// one. Parent task first: going down from the top task, the first task with
// an ownership decides for itself and every descendant task. Pure.
import type { ProjectId } from "./project";

/** What one task in a chain says about its own ownership. */
export interface OwnershipLink {
  /**
   * Its nearest project block in the block hierarchy, itself not counting
   * (a block that is both is not its own task's project); absent for none.
   */
  readonly projectBlock?: ProjectId;
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
  // The top task first: the first ownership found decides the branch.
  for (let i = selfAndAncestors.length - 1; i >= 0; i--) {
    const block = selfAndAncestors[i]?.projectBlock;
    if (block !== undefined && isProject(block)) return block;
  }
  return null;
}
