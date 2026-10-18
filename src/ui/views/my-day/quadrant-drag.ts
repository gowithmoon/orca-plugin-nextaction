// Dragging in My Day's quadrant layout (GLOSSARY: 四象限, #199): a card
// dropped in another quadrant moves its task there, the domain rewriting
// the importance or urgency that crosses the threshold (`quadrantChanges`);
// dropped in its own quadrant, nothing is written. Done and skipped cards
// drag too. The quadrant the pointer is over is highlighted while it would
// take the drop.
//
// These are the cards' drops in the plugin panel (`PanelDropTarget`) on the
// shared card drag (ui/drag/card-drag.tsx, #124), which handles the press,
// the threshold, the chip, the fading and a drop on a block in a note panel
// (a link, #127). Near the top or bottom of the frame the quadrants scroll
// in, it scrolls.
//
// Smooth by design, as the timeline's drag: the highlight is set on the DOM
// directly and a move renders nothing. A drop hands what it writes to
// `commit`, once, in the same event that ends the drag. Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import {
  type Quadrant,
  quadrantOf,
  quadrants,
} from "../../../domain/task/quadrant";
import type { Task } from "../../../domain/task/task";
import { scrollingAncestor } from "../../drag/auto-scroll";
import type { PanelDropTarget } from "../../drag/card-drag";

/** Marks a quadrant, holding which one it is. */
export const quadrantAttribute = "data-nextaction-my-day-quadrant";
/** Set on the quadrant the pointer is over while it would take the drop. */
const overAttribute = "data-drop-over";

/** What a drop writes, once: `task` moved to quadrant `target`. */
export interface QuadrantDrop {
  readonly kind: "quadrant";
  readonly task: Task;
  readonly target: Quadrant;
}

/** What the drag needs from the view, read when it is used. */
export interface QuadrantDragSetup {
  /** The quadrants' element. */
  readonly root: HTMLElement | null;
  readonly commit: (drop: QuadrantDrop) => void;
}

export interface QuadrantDrag {
  /** The drops in the plugin panel of `task`'s card, as shown. */
  target(task: Task): PanelDropTarget;
}

const isQuadrant = (value: string | null): value is Quadrant =>
  (quadrants as readonly (string | null)[]).includes(value);

/**
 * The quadrant under the point other than `task`'s own, and its element,
 * only within `root`.
 */
function quadrantAt(
  root: HTMLElement,
  task: Task,
  x: number,
  y: number,
): { readonly target: Quadrant; readonly element: Element } | null {
  const element = document.elementFromPoint(x, y);
  if (!element || !root.contains(element)) return null;
  const found = element.closest(`[${quadrantAttribute}]`);
  if (!found || !root.contains(found)) return null;
  const target = found.getAttribute(quadrantAttribute);
  if (!isQuadrant(target) || target === quadrantOf(task)) return null;
  return { target, element: found };
}

/** The drag of one quadrant layout: the state outside React. */
export function createQuadrantDrag(
  setup: () => QuadrantDragSetup,
): QuadrantDrag {
  let over: Element | null = null;

  const highlight = (next: Element | null) => {
    if (over === next) return;
    over?.removeAttribute(overAttribute);
    next?.setAttribute(overAttribute, "");
    over = next;
  };

  return {
    target: (task) => ({
      move(x, y) {
        const { root } = setup();
        highlight(
          root ? (quadrantAt(root, task, x, y)?.element ?? null) : null,
        );
      },
      drop(x, y) {
        const { root, commit } = setup();
        const at = root ? quadrantAt(root, task, x, y) : null;
        if (!at) return false;
        commit({ kind: "quadrant", task, target: at.target });
        return true;
      },
      end() {
        highlight(null);
      },
      scrollers() {
        const root = setup().root;
        const scroller = root && scrollingAncestor(root);
        return scroller ? [scroller] : [];
      },
    }),
  };
}

const DragContext = React.createContext<QuadrantDrag | undefined>(undefined);

export const QuadrantDragProvider = DragContext.Provider;

/** The quadrant layout's drag, for its cards' drops in the panel. */
export function useQuadrantDrag(): QuadrantDrag | undefined {
  return React.useContext(DragContext);
}
