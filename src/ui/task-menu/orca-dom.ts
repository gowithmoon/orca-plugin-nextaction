// Everything that depends on Orca's internal DOM (class names, structure, the
// `data-` attributes on `.orca-tag`) lives in this file only. None of it is a
// public API: check it by hand in Orca after every Orca upgrade
// (status-icon-task-menu, page-task spikes).

/** A tag property value to match, by the property's and option's note-facing names. */
export interface TagValueMatch {
  property: string;
  value: string;
}

/** The element whose `::before` draws the status icon. */
export const iconHostClass = "orca-repr-main-content";

/** Quotes a string for a CSS attribute selector value. */
const quoted = (value: string) =>
  `"${value.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ")}"`;

/**
 * The `data-` attribute Orca puts on `.orca-tag` for a tag property: the name
 * lowercased, spaces replaced by `_` (page-task P4). The value is the option
 * name or the number as written.
 */
const dataAttribute = (property: string) =>
  `data-${property.toLowerCase().replace(/ /g, "_")}`;

/**
 * `.orca-tag` elements of the tag; `data-name` holds the lowercased tag
 * name, so it is matched case-insensitively.
 */
function tagSelector(tagName: string, match?: TagValueMatch): string {
  const tag = `.orca-tag[data-name=${quoted(tagName)} i]`;
  if (!match) return tag;
  return `${tag}[${CSS.escape(dataAttribute(match.property))}=${quoted(match.value)}]`;
}

/**
 * The `::before` of every icon host whose block carries the tag (optionally
 * with a property value), as a selector list. Covers blocks in journals and
 * pages, page titles (same structure, page-task P3), mirrors, card titles and
 * tag page lists (status-icon-task-menu).
 */
export function iconSelector(tagName: string, match?: TagValueMatch): string {
  const tag = tagSelector(tagName, match);
  const host = `.${iconHostClass}`;
  return [
    `${host}:has(>.orca-tags>${tag})::before`,
    `.orca-repr:has(>.orca-repr-card-title>.orca-tags>${tag})>.orca-repr-main>${host}::before`,
    `.orca-query-card-title:has(>.orca-tags>${tag}) ~ .orca-block>.orca-repr>.orca-repr-main>${host}::before`,
  ].join(",\n");
}
