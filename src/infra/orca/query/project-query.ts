// The query for every project (#143): blocks carrying the project tag that
// have a parent or an alias, the same rule as for tasks (ADR 0013,
// tag-property-query). A mirror carries no tag of its own and is not
// returned (project-tag, round 2).
import type { QueryDescription2 } from "../../../orca.d.ts";

/** Group and condition kinds (src/orca.d.ts, QueryKind*). */
const selfAnd = 100;
const selfOr = 101;
const tagKind = 4;
const blockKind = 9;

/** `query` returns only 20 results unless told otherwise. */
const allResults = 100_000;

export function buildProjectQuery(tagName: string): QueryDescription2 {
  return {
    q: {
      kind: selfAnd,
      conditions: [
        { kind: tagKind, name: tagName },
        {
          kind: selfOr,
          conditions: [
            { kind: blockKind, hasParent: true },
            { kind: blockKind, hasAliases: true },
          ],
        },
      ],
    },
    pageSize: allResults,
  };
}
