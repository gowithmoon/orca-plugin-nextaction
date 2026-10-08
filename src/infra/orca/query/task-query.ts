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
import {
  type NoteLanguage,
  type PropertyKey,
  propertyName,
  statusName,
} from "../codec/names";
import { OrcaError } from "../orca-error";

/** The task tag's name, and the language of the names on it (ADR 0009). */
export interface TaskTagNames {
  tagName: string;
  language: NoteLanguage;
  /** Plugin properties whose definition conflicts (#19); never filtered by. */
  invalidated: readonly PropertyKey[];
}

/** The properties a filter actually constrains. */
function filteredProperties(filter: TaskFilter): PropertyKey[] {
  const used = (values: TaskFilter["contexts"]) =>
    (values?.includes?.length ?? 0) + (values?.excludes?.length ?? 0) > 0;
  const keys: PropertyKey[] = [];
  if ((filter.statuses ?? []).length > 0) keys.push("status");
  if (used(filter.contexts)) keys.push("context");
  if (used(filter.labels)) keys.push("label");
  return keys;
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

/**
 * Throws an `OrcaError` when the filter uses an invalidated property: such a
 * property reads as empty (ADR 0008), so a query on it would disagree with
 * reading.
 */
export function buildTaskQuery(
  filter: TaskFilter,
  tag: TaskTagNames,
): QueryDescription2 {
  const refused = filteredProperties(filter).filter((key) =>
    tag.invalidated.includes(key),
  );
  if (refused.length > 0) {
    throw new OrcaError(
      `cannot filter by invalidated properties: ${refused.join(", ")}`,
    );
  }
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
        // Excludes orphans (deleted tasks still referenced elsewhere) and
        // journal blocks, but keeps pages: a task has a parent or an alias
        // (ADR 0013, page-task P2).
        {
          kind: selfOr,
          conditions: [
            { kind: blockKind, hasParent: true },
            { kind: blockKind, hasAliases: true },
          ],
        },
        ...groups,
      ],
    },
    pageSize: allResults,
  };
}
