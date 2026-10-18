// The AI summary's text, as the user edited it, read into its parts (#201
// AI 小结): each part's name and the list items below it, for writing to the
// journal as blocks under blocks. Pure.

/** One part of the summary: its name line and its items. */
export interface SummaryPart {
  readonly heading: string;
  readonly items: readonly string[];
}

/**
 * How a list item starts: "- ", or "* " and "• " the user may type; a marker
 * alone on its line is an empty item.
 */
const itemMarker = /^[-*•](?:\s|$)/;

export function summaryParts(text: string): SummaryPart[] {
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
