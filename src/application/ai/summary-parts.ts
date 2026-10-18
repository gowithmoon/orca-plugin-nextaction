// The AI summary's text, as the user edited it, read into its parts (#201
// AI 小结): each part's name and the list items below it, for writing to the
// journal as blocks under blocks. Pure.
import type { JournalSummaryPart } from "../ports/task-repository";

/**
 * How a list item starts: "- ", or "* " and "• " the user may type; a marker
 * alone on its line is an empty item.
 */
const itemMarker = /^[-*•](?:\s|$)/;

/**
 * `text`'s parts in order. A non-blank line that is not a list item starts a
 * part, named by it; a list item goes to the latest part, its marker
 * removed; items before any part go to a part with an empty name. Blank
 * lines and empty items are left out.
 */
export function summaryParts(text: string): JournalSummaryPart[] {
  const parts: { heading: string; items: string[] }[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const item = trimmed.match(itemMarker);
    if (item !== null) {
      const itemText = trimmed.slice(item[0].length).trim();
      if (itemText === "") continue;
      if (parts.length === 0) parts.push({ heading: "", items: [] });
      parts[parts.length - 1]?.items.push(itemText);
    } else {
      parts.push({ heading: trimmed, items: [] });
    }
  }
  return parts;
}
