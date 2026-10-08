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
  return iconHostSelectors(tagName, match)
    .map((host) => `${host}::before`)
    .join(",\n");
}

/** The icon hosts of blocks carrying the tag, one selector per place a task shows. */
function iconHostSelectors(tagName: string, match?: TagValueMatch): string[] {
  const tag = tagSelector(tagName, match);
  const host = `.${iconHostClass}`;
  return [
    `${host}:has(>.orca-tags>${tag})`,
    `.orca-repr:has(>.orca-repr-card-title>.orca-tags>${tag})>.orca-repr-main>${host}`,
    `.orca-query-card-title:has(>.orca-tags>${tag}) ~ .orca-block>.orca-repr>.orca-repr-main>${host}`,
  ];
}

/** A status icon under the pointer. */
export interface StatusIconHit {
  /** The ID of the block the icon belongs to; a mirror's own ID, resolved by the repository. */
  blockId: number;
  /** Where the icon is drawn, to place the task menu at. */
  rect: DOMRect;
}

/**
 * The status icon the pointer event lands on, if any. Pseudo-elements are
 * not event targets, so the event is on the icon host and the point is
 * checked against the `::before` box: its width plus margin, and the first
 * line's height, with a few pixels to spare (status-icon-task-menu).
 */
export function statusIconAt(
  event: MouseEvent,
  tagName: string,
): StatusIconHit | undefined {
  if (!(event.target instanceof Element)) return undefined;
  const host = event.target.closest<HTMLElement>(`.${iconHostClass}`);
  if (!host?.matches(iconHostSelectors(tagName).join(","))) return undefined;
  const blockId = Number(host.closest<HTMLElement>(".orca-block")?.dataset.id);
  if (!Number.isInteger(blockId)) return undefined;

  const hostStyle = getComputedStyle(host);
  const icon = getComputedStyle(host, "::before");
  const fontSize = Number.parseFloat(icon.fontSize) || 16;
  const width =
    (Number.parseFloat(icon.width) || fontSize) +
    (Number.parseFloat(icon.marginRight) || 0);
  const lineHeight = Number.parseFloat(hostStyle.lineHeight) || fontSize * 1.6;
  const box = host.getBoundingClientRect();
  const left = box.left + (Number.parseFloat(hostStyle.paddingLeft) || 0);
  const x = event.clientX - left;
  const y = event.clientY - box.top;
  if (x < -2 || x > width + 2 || y < -2 || y > lineHeight + 4) return undefined;
  return { blockId, rect: new DOMRect(left, box.top, width, lineHeight) };
}
