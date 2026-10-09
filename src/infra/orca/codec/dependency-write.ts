// Writing a task's dependencies (#57): the value of a block reference
// property holds reference IDs, never block IDs (tag-operations A2). A target
// the task already depends on keeps its reference; a new one needs a
// reference created first, with `createRef(task, target, 3)`. Leaving a
// reference ID out of the value written removes that dependency, and Orca
// deletes the reference (A4, A5). Pure; the repository runs the plan.
import { findPropertyKey } from "./names";
import { findTaskTagRef, type RawBlock } from "./task-codec";

/** Orca `RefType.RefData`: what a block reference property's value points through. */
const refDataRef = 3;

/** One entry of the dependencies value to write, in order. */
export type DependencyWriteItem =
  /** Already a dependency: its reference ID is written again. */
  | { kind: "existing"; refId: number }
  /** A reference to `target` is created first; its ID is then written. */
  | { kind: "new"; target: number };

/**
 * The reference IDs the task's dependencies value holds now. Only these are
 * dependencies: a date value also makes a `type: 3` reference (to a journal,
 * tag-operations round 1 step 06), which is not one.
 */
function currentDependencyRefIds(
  block: Pick<RawBlock, "refs">,
  tagBlockId: number,
): Set<unknown> {
  const data = findTaskTagRef(block.refs, tagBlockId)?.data ?? [];
  const item = data.find(
    (d) => findPropertyKey(d.name)?.key === "dependencies",
  );
  return new Set(Array.isArray(item?.value) ? item.value : []);
}

/**
 * What to write so the task's dependencies are exactly `targets` (block IDs
 * of source blocks, in order), given the task block as read. A target listed
 * twice is written once.
 */
export function planDependencyWrite(
  block: Pick<RawBlock, "refs">,
  tagBlockId: number,
  targets: readonly number[],
): DependencyWriteItem[] {
  const current = currentDependencyRefIds(block, tagBlockId);
  const items: DependencyWriteItem[] = [];
  for (const target of new Set(targets)) {
    const ref = block.refs.find(
      (r) => r.type === refDataRef && r.to === target && current.has(r.id),
    );
    items.push(
      ref ? { kind: "existing", refId: ref.id } : { kind: "new", target },
    );
  }
  return items;
}

/**
 * The blocks that may depend on `block`, each with the IDs of its `type: 3`
 * references to it, found in the block's `backRefs`
 * (next-action-hierarchy-boolean-deps). Inline references (`type: 1`) are not
 * dependencies; a `type: 3` reference is not always one either (a date makes
 * one too), so `dependenciesWithout` confirms each against the dependent's
 * dependencies value. References from the block itself are left out: its own
 * task tag goes when it is dropped.
 */
export function dependentsOf(block: {
  id: number;
  backRefs?: readonly { id: number; from: number; type: number }[] | null;
}): Map<number, Set<number>> {
  const dependents = new Map<number, Set<number>>();
  for (const ref of block.backRefs ?? []) {
    if (ref.type !== refDataRef || ref.from === block.id) continue;
    const refIds = dependents.get(ref.from) ?? new Set<number>();
    refIds.add(ref.id);
    dependents.set(ref.from, refIds);
  }
  return dependents;
}

/** What to do with a dependent's dependencies value when a target goes. */
export type DependencyRemoval =
  /** The value holds none of the references: nothing to write. */
  | { kind: "unchanged" }
  /** Write these reference IDs back, in order; `[]` removes the value (A4). */
  | { kind: "write"; refIds: number[] }
  /** The value holds something other than reference IDs: left as it is. */
  | { kind: "unreadable"; raw: unknown };

/**
 * The dependencies value of `dependent` without the references in `refIds`,
 * every other entry kept in order. A reference ID left out is removed with
 * its reference (tag-operations A4, A5).
 */
export function dependenciesWithout(
  dependent: Pick<RawBlock, "refs">,
  tagBlockId: number,
  refIds: ReadonlySet<number>,
): DependencyRemoval {
  const data = findTaskTagRef(dependent.refs, tagBlockId)?.data ?? [];
  const value = data.find(
    (d) => findPropertyKey(d.name)?.key === "dependencies",
  )?.value;
  if (!Array.isArray(value) || !value.some((item) => refIds.has(item))) {
    return { kind: "unchanged" };
  }
  if (!value.every((item): item is number => typeof item === "number")) {
    return { kind: "unreadable", raw: value };
  }
  return { kind: "write", refIds: value.filter((item) => !refIds.has(item)) };
}
