// Scrolling while dragging a task card (#122): a scroller scrolls while the
// pointer stays near its top or bottom edge, faster the nearer, one step a
// frame (card-drag.tsx runs the frames). Shared by every view's drag, for
// the plugin panel's scrollers and the note panels' alike.

/** How close to a scroller's top or bottom edge it scrolls. */
const scrollEdge = 40;
/** The most it scrolls per frame, right at the edge. */
const scrollStep = 14;

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
 * How far to scroll `scroller` this frame with the pointer at (x, y): none
 * away from its edges, or where it cannot scroll further that way.
 */
export function scrollAmount(
  scroller: HTMLElement,
  x: number,
  y: number,
): number {
  const box = scroller.getBoundingClientRect();
  if (x < box.left || x > box.right) return 0;
  const bottom = scroller.scrollHeight - scroller.clientHeight;
  if (y >= box.top && y < box.top + scrollEdge && scroller.scrollTop > 0) {
    return -Math.ceil(((box.top + scrollEdge - y) / scrollEdge) * scrollStep);
  }
  if (
    y <= box.bottom &&
    y > box.bottom - scrollEdge &&
    scroller.scrollTop < bottom
  ) {
    return Math.ceil(
      ((y - (box.bottom - scrollEdge)) / scrollEdge) * scrollStep,
    );
  }
  return 0;
}

/**
 * Scrolls the first of `scrollers` the pointer is near an edge of, by one
 * frame's step; whether any scrolled.
 */
export function scrollNearEdge(
  scrollers: readonly HTMLElement[],
  x: number,
  y: number,
): boolean {
  for (const scroller of scrollers) {
    const by = scrollAmount(scroller, x, y);
    if (by === 0) continue;
    scroller.scrollTop += by;
    return true;
  }
  return false;
}

/**
 * As `scrollAmount`, sideways: how far to scroll `scroller` this frame with
 * the pointer near its left or right edge (the project board, #168).
 */
export function scrollAmountX(
  scroller: HTMLElement,
  x: number,
  y: number,
): number {
  const box = scroller.getBoundingClientRect();
  if (y < box.top || y > box.bottom) return 0;
  const right = scroller.scrollWidth - scroller.clientWidth;
  if (x >= box.left && x < box.left + scrollEdge && scroller.scrollLeft > 0) {
    return -Math.ceil(((box.left + scrollEdge - x) / scrollEdge) * scrollStep);
  }
  if (
    x <= box.right &&
    x > box.right - scrollEdge &&
    scroller.scrollLeft < right
  ) {
    return Math.ceil(
      ((x - (box.right - scrollEdge)) / scrollEdge) * scrollStep,
    );
  }
  return 0;
}

/** As `scrollNearEdge`, sideways, near the left and right edges. */
export function scrollNearSideEdge(
  scrollers: readonly HTMLElement[],
  x: number,
  y: number,
): boolean {
  for (const scroller of scrollers) {
    const by = scrollAmountX(scroller, x, y);
    if (by === 0) continue;
    scroller.scrollLeft += by;
    return true;
  }
  return false;
}
