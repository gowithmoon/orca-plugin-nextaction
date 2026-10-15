// Where each task sits among the others: its parent task and its place in
// the notes, worked out from blocks as get-blocks returns them
// (next-action-hierarchy-boolean-deps). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { TaskId } from "../../../domain/task/task";

/** What the hierarchy reads of a block. */
export interface HierarchyBlock {
  readonly id: number;
  /** `null` or missing for a root block (a page, or a journal). */
  readonly parent?: number | null;
  readonly children?: readonly number[] | null;
}

/** A task's nearest task ancestor and its place in the notes. */
export interface TaskPlace {
  readonly parentId: TaskId | null;
  /** Lower comes first (document preorder). */
  readonly position: number;
  /**
   * The nearest ancestor block among the project blocks (GLOSSARY: 所属项
   * 目), the block itself not counting; absent when there is none.
   */
  readonly projectBlock?: number;
}

/**
 * The parent IDs not yet read: the next layer of ancestors to fetch. A
 * parent already read, or already asked for, is not asked for again.
 */
export function missingParents(
  blocks: ReadonlyMap<number, HierarchyBlock>,
  asked: ReadonlySet<number>,
): number[] {
  const missing = new Set<number>();
  for (const block of blocks.values()) {
    const parent = block.parent;
    if (parent == null || blocks.has(parent) || asked.has(parent)) continue;
    missing.add(parent);
  }
  return [...missing];
}

/** Compares two paths element by element; a prefix comes first. */
function comparePaths(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return a.length - b.length;
}

/**
 * The place of every task in `taskIds`, given every block on the way up
 * from them (the tasks and their ancestors). The parent task is the first
 * task met going up `parent`; the position orders tasks by the path of
 * "index in the parent's `children`" from the root, the root's ID first. A
 * chain stops at a parent that could not be read, which then counts as the
 * root.
 *
 * The project blocks `projectIds` (#143) are placed among the tasks in the
 * same order, and every block placed gets its nearest project block on the
 * way up, itself not counting. A block in both lists is placed once.
 */
export function placeTasks(
  taskIds: readonly TaskId[],
  blocks: ReadonlyMap<number, HierarchyBlock>,
  projectIds: readonly number[] = [],
): Map<number, TaskPlace> {
  const tasks = new Set(taskIds);
  const projects = new Set(projectIds);
  const placed = [...new Set([...taskIds, ...projectIds])];
  const paths = new Map<number, number[]>();
  const parents = new Map<number, TaskId | null>();
  const projectBlocks = new Map<number, number>();
  for (const id of placed) {
    const path: number[] = [];
    let parentTask: TaskId | null = null;
    let projectBlock: number | undefined;
    const seen = new Set<number>([id]);
    let current = id;
    for (;;) {
      const parentId = blocks.get(current)?.parent;
      const parent = parentId == null ? undefined : blocks.get(parentId);
      if (parentId == null || !parent || seen.has(parentId)) {
        path.unshift(current);
        break;
      }
      const index = (parent.children ?? []).indexOf(current);
      // A block missing from its parent's children (not expected) goes last.
      path.unshift(index === -1 ? Number.MAX_SAFE_INTEGER : index);
      if (parentTask === null && tasks.has(parentId)) parentTask = parentId;
      if (projectBlock === undefined && projects.has(parentId)) {
        projectBlock = parentId;
      }
      seen.add(parentId);
      current = parentId;
    }
    paths.set(id, path);
    parents.set(id, parentTask);
    if (projectBlock !== undefined) projectBlocks.set(id, projectBlock);
  }
  const ordered = placed.sort(
    (a, b) => comparePaths(paths.get(a) ?? [], paths.get(b) ?? []) || a - b,
  );
  const places = new Map<number, TaskPlace>();
  ordered.forEach((id, position) => {
    const projectBlock = projectBlocks.get(id);
    places.set(id, {
      parentId: parents.get(id) ?? null,
      position,
      ...(projectBlock !== undefined && { projectBlock }),
    });
  });
  return places;
}
