// Clearing a task's 所属项目 setting when its project is dropped (#150). The
// value holds reference IDs, as dependencies do (project-tag); leaving a
// reference ID out of the value written removes it with its reference, and
// `[]` removes the value (project-tag round 2, tag-operations A4, A5). Pure;
// the repository runs the write.
import { PropType } from "../prop-type";
import type { DependencyRemoval } from "./dependency-write";
import { findPropertyKey, propertyName } from "./names";
import { findTaskTagRef, type RawBlock } from "./task-codec";
import type { RefDataItem, TaskWriteContext } from "./task-encode";

/**
 * The 所属项目 value of `task` without the references in `refIds`, every other
 * entry kept in order (a second value is ignored when read, ADR 0025, but
 * not thrown away here). A `type: 3` reference to the project that the value
 * does not hold is not a setting: `unchanged`.
 */
export function projectSettingWithout(
  task: Pick<RawBlock, "refs">,
  tagBlockId: number,
  refIds: ReadonlySet<number>,
): DependencyRemoval {
  const data = findTaskTagRef(task.refs, tagBlockId)?.data ?? [];
  const value = data.find(
    (d) => findPropertyKey(d.name)?.key === "project",
  )?.value;
  if (!Array.isArray(value) || !value.some((item) => refIds.has(item))) {
    return { kind: "unchanged" };
  }
  if (!value.every((item): item is number => typeof item === "number")) {
    return { kind: "unreadable", raw: value };
  }
  return { kind: "write", refIds: value.filter((item) => !refIds.has(item)) };
}

/** The 所属项目 value: reference IDs, never block IDs (project-tag). */
export function encodeProjectSetting(
  refIds: readonly number[],
  tag: Pick<TaskWriteContext, "language">,
): RefDataItem {
  return {
    name: propertyName("project", tag.language),
    type: PropType.BlockRefs,
    value: [...refIds],
  };
}
