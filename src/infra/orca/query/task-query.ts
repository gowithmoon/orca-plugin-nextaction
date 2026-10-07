// TaskFilter → QueryDescription2. Only the shapes listed under "能用的条件" in
// docs/spikes/tag-property-query.md are used; the tests guard the two that
// give wrong results (single-select `op: 3` with an array, multi-select
// `op: 4`).
import type { TaskFilter } from "../../../application/ports/task-repository";
import type { TaskStatus } from "../../../domain/task/task";
import type {
  QueryDescription2,
  QueryItem2,
  QueryTag2,
  QueryTagProperty,
} from "../../../orca.d.ts";
import { type NoteLanguage, propertyName, statusName } from "../codec/names";

/** The task tag's name, and the language of the names on it (ADR 0009). */
export interface TaskTagNames {
  tagName: string;
  language: NoteLanguage;
}

/** `query` returns only 20 results unless told otherwise. */
const allResults = 100_000;

/** Group and condition kinds (src/orca.d.ts, QueryKind*). */
const selfAnd = 100;
const selfOr = 101;
const ancestorAnd = 102;
const tagKind = 4;
const blockKind = 9;
const blockMatchKind = 12;

/** Property operators (src/orca.d.ts, Query*). */
const eq = 1;
const includes = 3;

function tagCondition(
  tag: TaskTagNames,
  properties: QueryTagProperty[] = [],
): QueryTag2 {
  return properties.length > 0
    ? { kind: tagKind, name: tag.tagName, properties }
    : { kind: tagKind, name: tag.tagName };
}

function statusIs(status: TaskStatus, tag: TaskTagNames): QueryTagProperty {
  return {
    name: propertyName("status", tag.language),
    op: eq,
    value: statusName(status, tag.language),
  };
}

export function buildTaskQuery(
  filter: TaskFilter,
  tag: TaskTagNames,
): QueryDescription2 {
  const properties: QueryTagProperty[] = [];
  const groups: QueryItem2[] = [];
  const statuses = filter.statuses ?? [];
  if (statuses.length === 1) {
    properties.push(statusIs(statuses[0], tag));
  } else if (statuses.length > 1) {
    // A single-select property with `op: 3` and an array matches nothing
    // (Q3b); one tag condition per status, OR-ed, matches correctly (Q3).
    groups.push({
      kind: selfOr,
      conditions: statuses.map((status) =>
        tagCondition(tag, [statusIs(status, tag)]),
      ),
    });
  }
  const multiValue = [
    ["context", filter.contexts],
    ["label", filter.labels],
  ] as const;
  for (const [key, values] of multiValue) {
    const name = propertyName(key, tag.language);
    if (values?.includes && values.includes.length > 0) {
      properties.push({ name, op: includes, value: [...values.includes] });
    }
    for (const value of values?.excludes ?? []) {
      // `op: 4` on a multi-select property means "holds some other value"
      // (Q11); a negated group holding `op: 3` means "does not hold" (Q11c).
      groups.push({
        kind: selfAnd,
        negate: true,
        conditions: [tagCondition(tag, [{ name, op: includes, value }])],
      });
    }
  }
  if (filter.underBlockId !== undefined) {
    // Any depth, also through blocks that are not tasks (H1, H2).
    groups.push({
      kind: ancestorAnd,
      conditions: [{ kind: blockMatchKind, blockId: filter.underBlockId }],
    });
  }
  return {
    q: {
      kind: selfAnd,
      conditions: [
        tagCondition(tag, properties),
        // Excludes orphans: deleted tasks still referenced elsewhere.
        { kind: blockKind, hasParent: true },
        ...groups,
      ],
    },
    pageSize: allResults,
  };
}
