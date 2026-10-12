// The query behind block reference candidates (#115): blocks whose text holds
// what is searched, under a tag when the property has a scope. Chosen over
// `search-blocks-by-text` (no scope, no journal or orphan filter) and
// `get-blocks-with-tags` (no text, every block of the tag fetched whole)
// because one `query` does all three. How the text condition (`kind: 8`)
// matches is measured in docs/spikes/custom-properties.md, "块引用候选的搜索":
// the block's text with its property values, ignoring case, word-based
// rather than a substring. Kept behind the repository so it can be swapped.
import type { QueryDescription2, QueryItem2 } from "../../../orca.d.ts";

/** Group and condition kinds (src/orca.d.ts, QueryKind*). */
const selfAnd = 100;
const selfOr = 101;
const tagKind = 4;
const textKind = 8;
const blockKind = 9;

/**
 * Enough candidates to pick from; more words narrow them. `query` returns
 * only 20 unless told otherwise (tag-property-query).
 */
const candidateLimit = 200;

/**
 * The query for blocks whose text holds `search` (trimmed), only those
 * carrying the tag `scope` when given. Journal blocks and orphans are left
 * out as for tasks: a block has a parent or an alias (ADR 0013, page-task
 * P2). With nothing searched, the blocks of the scope tag; `undefined` when
 * there is neither, as listing every block is not a search.
 */
export function buildBlockSearchQuery(
  search: string,
  scope: string | null,
): QueryDescription2 | undefined {
  const text = search.trim();
  if (text === "" && scope === null) return undefined;
  const conditions: QueryItem2[] = [];
  if (scope !== null) conditions.push({ kind: tagKind, name: scope });
  if (text !== "") conditions.push({ kind: textKind, text });
  conditions.push({
    kind: selfOr,
    conditions: [
      { kind: blockKind, hasParent: true },
      { kind: blockKind, hasAliases: true },
    ],
  });
  return { q: { kind: selfAnd, conditions }, pageSize: candidateLimit };
}
