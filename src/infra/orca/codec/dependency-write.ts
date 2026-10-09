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
