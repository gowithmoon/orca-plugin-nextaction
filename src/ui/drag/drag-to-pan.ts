// Dragging a scroller's empty space sideways moves it left and right (#187),
// for a mouse with no sideways wheel: the project gantt chart and the
// project board. Only sideways: up and down stay with the wheel, and a press
// drifting up or down moves nothing. A press on anything pressed for itself
// (a button, a task card or subtask row, a bar, a name, an unplaced task) is
// left to it: those drags take their press on pointerdown, deeper in the
// tree, and this one never begins for them. A press that does not move does
// nothing, so a click stays a click. Touch scrolls by itself and is left
// alone.
//
// Pointer events on the scroller (React props), with pointer capture once
// panning: nothing outlives the component (docs/ARCHITECTURE.md §4). While
// panning the document root carries `panningAttribute` (a grabbing cursor,
// no text selected) and the scroller `pannedAttribute` (no scroll snapping,
// back on letting go), drag-to-pan-style.ts. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";

/** How far the pointer goes sideways before a press pans. */
const panThreshold = 4;
/** Set on the document root while panning. */
const panningAttribute = "data-nextaction-panning";
/** Set on the scroller while panning. */
const pannedAttribute = "data-nextaction-panned";
/**
 * Presses on these are their own: controls (a bar is a button), anything
 * acting as a button (the gantt chart's names and unplaced tasks), and task
 * cards and their subtask rows (useCardDrag's marker).
 */
const ownPress = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[contenteditable]",
  '[role="button"]',
  "[data-nextaction-card-drag]",
].join(", ");

interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly scrollLeft: number;
  panning: boolean;
}

/** Whether the press at (x, y) is on the target's own scrollbar. */
function onScrollbar(target: Element, x: number, y: number): boolean {
  // An inline element (a text span) has no client box, and no scrollbar.
  if (!(target instanceof HTMLElement) || target.clientWidth === 0) {
    return false;
  }
  const box = target.getBoundingClientRect();
  return (
    x - box.left - target.clientLeft >= target.clientWidth ||
    y - box.top - target.clientTop >= target.clientHeight
  );
}

/**
 * The pointer handlers that let a press on a scroller's empty space pan it
 * sideways; spread them on the scroller itself. `ignore`: a selector for
 * more places that are not empty space (the gantt chart's tree column).
 */
export function useDragToPan(
  options: { ignore?: string } = {},
): React.HTMLAttributes<HTMLElement> {
  const press = React.useRef<Press | null>(null);
  const scroller = React.useRef<HTMLElement | null>(null);
  /** The click that ends a pan is no click. */
  const clickTaken = React.useRef(false);
  const { ignore } = options;

  const stop = React.useCallback(() => {
    const current = press.current;
    press.current = null;
    if (current?.panning) {
      document.documentElement.removeAttribute(panningAttribute);
      scroller.current?.removeAttribute(pannedAttribute);
    }
    return current;
  }, []);
  // The view going away while panning (the panel closing).
  React.useEffect(
    () => () => {
      stop();
    },
    [stop],
  );

  return {
    onPointerDown(event) {
      clickTaken.current = false;
      stop();
      const { target } = event;
      if (
        event.button !== 0 ||
        event.pointerType === "touch" ||
        !(target instanceof Element)
      ) {
        return;
      }
      if (target.closest(ownPress)) return;
      if (ignore && target.closest(ignore)) return;
      if (onScrollbar(target, event.clientX, event.clientY)) return;
      scroller.current = event.currentTarget;
      // Not prevented: focus and the right-click menu stay as they are.
      press.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        scrollLeft: event.currentTarget.scrollLeft,
        panning: false,
      };
    },
    onPointerMove(event) {
      const current = press.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const dx = event.clientX - current.x;
      if (!current.panning) {
        // Let go somewhere the scroller did not hear.
        if ((event.buttons & 1) === 0) {
          stop();
          return;
        }
        // Only sideways counts.
        if (Math.abs(dx) < panThreshold) return;
        current.panning = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        // No snapping first, or it would pull every step back.
        event.currentTarget.setAttribute(pannedAttribute, "");
        document.documentElement.setAttribute(panningAttribute, "");
      }
      // Text the press began selecting is not what is dragged.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();
      event.currentTarget.scrollLeft = current.scrollLeft - dx;
    },
    onPointerUp(event) {
      if (press.current?.pointerId !== event.pointerId) return;
      if (stop()?.panning) clickTaken.current = true;
    },
    onPointerCancel(event) {
      if (press.current?.pointerId === event.pointerId) stop();
    },
    // Released by anything else (e.g. the window losing focus).
    onLostPointerCapture(event) {
      if (press.current?.pointerId === event.pointerId) stop();
    },
    // The browser's own drag of selected text would take the pointer.
    onDragStart(event) {
      if (press.current) event.preventDefault();
    },
    onClickCapture(event) {
      // From the keyboard (no pointer, `detail` 0): never a pan's.
      if (event.detail === 0 || !clickTaken.current) return;
      clickTaken.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
