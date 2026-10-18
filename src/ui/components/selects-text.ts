// Whether a click on a card or row was really the end of selecting its text.

/**
 * The click ended a text selection inside `element`: the selection holds
 * some text and lies in it. A selection elsewhere is not one: after Orca
 * starts, the plugin panel's hidden editor (ADR 0014) holds an empty,
 * uncollapsed range until another editor takes the selection, and every
 * click on a card would read as selecting text.
 */
export function selectsText(element: Element): boolean {
  const selection = window.getSelection();
  if (selection === null || selection.isCollapsed) return false;
  if (selection.toString() === "") return false;
  const range = selection.getRangeAt(0);
  return element.contains(range.commonAncestorContainer);
}
