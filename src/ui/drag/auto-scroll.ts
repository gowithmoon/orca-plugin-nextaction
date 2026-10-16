// Scrolling while dragging a task card (#122): a scroller scrolls while the
// pointer stays near its top or bottom edge, faster the nearer, one step a
// frame (card-drag.tsx runs the frames); the project board's sideways near
// its left or right edge too (#168). Shared by every view's drag, for the
// plugin panel's scrollers and the note panels' alike.

/** How close to a scroller's edge it scrolls. */
const scrollEdge = 40;
/** The most it scrolls per frame, right at the edge. */
const scrollStep = 14;

/** Which way a scroller scrolls: `y` up and down, `x` sideways. */
export type ScrollAxis = "x" | "y";

/** The nearest ancestor that scrolls vertically, if any. */
export function scrollingAncestor(
  element: HTMLElement,
): HTMLElement | undefined {
  for (
    let current = element.parentElement;
    current;
    current = current.parentElement
  ) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") return current;
  }
  return undefined;
}

/**
 * How far to scroll `scroller` along `axis` this frame with the pointer at
 * (x, y): none away from its edges on that axis, outside it across the
 * axis, or where it cannot scroll further that way.
 */
export function scrollAmount(
  scroller: HTMLElement,
  x: number,
  y: number,
  axis: ScrollAxis,
): number {
  const box = scroller.getBoundingClientRect();
  const [along, across, start, end, acrossStart, acrossEnd] =
    axis === "y"
      ? [y, x, box.top, box.bottom, box.left, box.right]
      : [x, y, box.left, box.right, box.top, box.bottom];
  if (across < acrossStart || across > acrossEnd) return 0;
  const scrolled = axis === "y" ? scroller.scrollTop : scroller.scrollLeft;
  const furthest =
    axis === "y"
      ? scroller.scrollHeight - scroller.clientHeight
      : scroller.scrollWidth - scroller.clientWidth;
  if (along >= start && along < start + scrollEdge && scrolled > 0) {
    return -Math.ceil(((start + scrollEdge - along) / scrollEdge) * scrollStep);
  }
  if (along <= end && along > end - scrollEdge && scrolled < furthest) {
    return Math.ceil(((along - (end - scrollEdge)) / scrollEdge) * scrollStep);
  }
  return 0;
}

/**
 * Scrolls the first of `scrollers` the pointer is near an edge of on
 * `axis`, by one frame's step; whether any scrolled.
 */
export function scrollNearEdge(
  scrollers: readonly HTMLElement[],
  x: number,
  y: number,
  axis: ScrollAxis,
): boolean {
  for (const scroller of scrollers) {
    const by = scrollAmount(scroller, x, y, axis);
    if (by === 0) continue;
    if (axis === "y") scroller.scrollTop += by;
    else scroller.scrollLeft += by;
    return true;
  }
  return false;
}
