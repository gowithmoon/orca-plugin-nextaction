// The task map canvas's pan and zoom (#213, docs/spikes/task-map-canvas.md),
// after the whiteboard plugin's way of doing it (not its code). One set of
// gestures for mouse and touchpad, no setting:
// - the wheel pans (Shift: sideways, Chrome still reporting `deltaY`);
// - Ctrl/⌘ with the wheel, or a pinch, zooms around the pointer, the factor
//   exponential in the delta so a mouse's ±100 a notch and a pinch's small
//   fractions are both smooth;
// - a left press on empty space, any left press with Space held, or a
//   middle press, drags to pan, with pointer capture so it carries on
//   outside the plugin panel; a right press only opens menus;
// - F fits the map to the window.
//
// The wheel listener is the one DOM listener `ui` adds itself
// (tests/architecture.test.ts, docs/ARCHITECTURE.md §4 插件面板中的画布):
// React's `onWheel` is passive and cannot keep the panel from scrolling or
// Orca from zooming. It is on the canvas element, added in an effect and
// removed in its cleanup. Everything else is React props.
//
// While a gesture runs, the view lives in a ref and goes straight onto the
// world's `transform`; it reaches the store (and React) when the gesture
// stops. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { MemoryStore } from "../../components/memory-store";
import type { CanvasView } from "./task-map-stores";

const minScale = 0.1;
const maxScale = 2;
/** Fitting never zooms in past this. */
const fitMaxScale = 1;
/** Space around the map when fitted. */
const fitPadding = 48;
/** How strongly a wheel delta zooms: the scale times `exp(-deltaY * k)`. */
const zoomPerDelta = 0.002;
/** The view reaches the store once the wheel has been still this long. */
const wheelCommitMs = 160;
/** How far a press moves before it pans. */
const panThreshold = 4;
/** Set on the document root while panning (drag-to-pan-style.ts). */
const panningAttribute = "data-nextaction-panning";
/**
 * Presses on these are their own, not empty space: controls and task cards
 * (a card's own press opens it, its status icon, its menu).
 */
const ownPress = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[contenteditable]",
  '[role="button"]',
  ".nextaction-task-card",
].join(", ");

interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly from: CanvasView;
  panning: boolean;
}

function clampScale(scale: number): number {
  return Math.min(maxScale, Math.max(minScale, scale));
}

/** The view showing the whole of `content` in a viewport of `width` × `height`. */
export function fittedView(
  content: { readonly width: number; readonly height: number },
  width: number,
  height: number,
): CanvasView {
  const usableW = Math.max(1, width - 2 * fitPadding);
  const usableH = Math.max(1, height - 2 * fitPadding);
  const scale = clampScale(
    Math.min(
      usableW / Math.max(1, content.width),
      usableH / Math.max(1, content.height),
      fitMaxScale,
    ),
  );
  return {
    x: width / 2 - (content.width / 2) * scale,
    y: height / 2 - (content.height / 2) * scale,
    scale,
  };
}

function transformOf(view: CanvasView): string {
  return `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

export interface CanvasInput {
  /** Spread on the viewport: the element the wheel and the pointer act on. */
  readonly handlers: React.HTMLAttributes<HTMLElement>;
  /** The world's style: its transform for the current view. */
  readonly worldStyle: React.CSSProperties;
  /**
   * Moves the view by `dx`, `dy` in world units (#218: a card kept where it
   * is on screen when the map is laid out again).
   */
  shift(dx: number, dy: number): void;
}

/**
 * The canvas's pan and zoom. `viewport` is the element clipping the map,
 * `world` the element moved and scaled, `content` the map's size (`null`
 * before it is laid out). The first time a laid out map is shown with no
 * view in `store`, it is fitted to the window.
 */
export function useCanvasInput(options: {
  viewport: React.RefObject<HTMLElement | null>;
  world: React.RefObject<HTMLElement | null>;
  store: MemoryStore<CanvasView | null>;
  content: { readonly width: number; readonly height: number } | null;
}): CanvasInput {
  const { viewport, world, store, content } = options;
  const committed = React.useSyncExternalStore(store.subscribe, store.current);
  const live = React.useRef<CanvasView>(committed ?? { x: 0, y: 0, scale: 1 });
  const press = React.useRef<Press | null>(null);
  const spaceHeld = React.useRef(false);
  /** The click that ends a pan is no click. */
  const clickTaken = React.useRef(false);

  const show = React.useCallback(
    (view: CanvasView) => {
      live.current = view;
      const element = world.current;
      if (element) element.style.transform = transformOf(view);
    },
    [world],
  );
  const commit = React.useCallback(() => {
    store.set(live.current);
  }, [store]);

  const fitToWindow = React.useCallback(() => {
    const element = viewport.current;
    if (!element || !content) return;
    show(fittedView(content, element.clientWidth, element.clientHeight));
    commit();
  }, [viewport, content, show, commit]);

  // On first entry: fitted once laid out. Later entries keep the view.
  React.useLayoutEffect(() => {
    if (store.current() === null && content) fitToWindow();
  }, [store, content, fitToWindow]);

  // The store cleared (a reload of the plugin) or set elsewhere.
  React.useLayoutEffect(() => {
    if (committed) show(committed);
  }, [committed, show]);

  // The non-passive wheel listener (see the file's head).
  React.useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const view = live.current;
      if (event.ctrlKey || event.metaKey) {
        const box = element.getBoundingClientRect();
        const mx = event.clientX - box.left;
        const my = event.clientY - box.top;
        const scale = clampScale(
          view.scale * Math.exp(-event.deltaY * zoomPerDelta),
        );
        const wx = (mx - view.x) / view.scale;
        const wy = (my - view.y) / view.scale;
        show({ x: mx - wx * scale, y: my - wy * scale, scale });
      } else if (event.shiftKey) {
        show({ ...view, x: view.x - (event.deltaY || event.deltaX) });
      } else {
        show({ ...view, x: view.x - event.deltaX, y: view.y - event.deltaY });
      }
      clearTimeout(timer);
      timer = setTimeout(commit, wheelCommitMs);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
      if (timer !== undefined) {
        clearTimeout(timer);
        commit();
      }
    };
  }, [viewport, show, commit]);

  const stop = React.useCallback(() => {
    const current = press.current;
    press.current = null;
    if (current?.panning) {
      document.documentElement.removeAttribute(panningAttribute);
      commit();
    }
    return current;
  }, [commit]);
  // The view going away while panning (the panel closing).
  React.useEffect(
    () => () => {
      stop();
    },
    [stop],
  );

  const handlers: React.HTMLAttributes<HTMLElement> = {
    onPointerDown(event) {
      clickTaken.current = false;
      stop();
      const { target } = event;
      if (!(target instanceof Element) || event.pointerType === "touch") {
        return;
      }
      const middle = event.button === 1;
      if (middle) {
        // Or Chrome starts its own autoscroll.
        event.preventDefault();
      } else if (event.button !== 0) {
        return;
      } else if (!spaceHeld.current && target.closest(ownPress)) {
        return;
      }
      press.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        from: live.current,
        panning: false,
      };
    },
    onPointerMove(event) {
      const current = press.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.panning) {
        // Let go somewhere the canvas did not hear.
        if ((event.buttons & 0b101) === 0) {
          stop();
          return;
        }
        if (Math.hypot(dx, dy) < panThreshold) return;
        current.panning = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        document.documentElement.setAttribute(panningAttribute, "");
      }
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();
      show({ ...current.from, x: current.from.x + dx, y: current.from.y + dy });
    },
    onPointerUp(event) {
      if (press.current?.pointerId !== event.pointerId) return;
      if (stop()?.panning) clickTaken.current = true;
    },
    onPointerCancel(event) {
      if (press.current?.pointerId === event.pointerId) stop();
    },
    onLostPointerCapture(event) {
      if (press.current?.pointerId === event.pointerId) stop();
    },
    onDragStart(event) {
      if (press.current) event.preventDefault();
    },
    onClickCapture(event) {
      if (event.detail === 0 || !clickTaken.current) return;
      clickTaken.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onKeyDown(event) {
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, [contenteditable]")
      ) {
        return;
      }
      if (event.key === " ") {
        // Held to pan; a focused card's Space would also scroll.
        event.preventDefault();
        spaceHeld.current = true;
      } else if (
        (event.key === "f" || event.key === "F") &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        fitToWindow();
      }
    },
    onKeyUp(event) {
      if (event.key === " ") spaceHeld.current = false;
    },
    onBlur(event) {
      // Focus moving out of the canvas lets go of Space.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        spaceHeld.current = false;
      }
    },
  };

  const shift = React.useCallback(
    (dx: number, dy: number) => {
      const view = live.current;
      show({
        ...view,
        x: view.x + dx * view.scale,
        y: view.y + dy * view.scale,
      });
      commit();
    },
    [show, commit],
  );

  return {
    handlers,
    worldStyle: { transform: transformOf(live.current) },
    shift,
  };
}
