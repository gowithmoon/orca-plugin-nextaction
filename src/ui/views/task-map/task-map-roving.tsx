// The task map's cards take the focus one at a time (#221, roving tabindex):
// only the card the keyboard is on is in the Tab order; Tab and Shift+Tab
// move it in note order, and past the last (or the first) card go to the
// header's controls, so the focus never leaves the plugin panel (task-map-
// canvas spike). The card focused by keyboard is panned into the window.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { TaskMapNode } from "../../../application/usecases/read-task-map";
import type { TaskId } from "../../../domain/task/task";
import type { LayoutBox } from "../../../domain/task-map/layout";
import type { CanvasInput } from "./canvas-input";
import { boxKey, type TaskMapBoxKey } from "./task-map-stores";

/** Which card is in the Tab order (#221): the one the keyboard is on. */
export type Roving = (id: TaskId) => boolean;

/** What the header's controls are, for Tab past the cards' ends. */
const focusable =
  'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const taskKey = (id: TaskId) => boxKey("task", id);

export function useCardRoving(props: {
  nodes: readonly TaskMapNode[];
  /** The map laid out, `null` while measuring. */
  placed: {
    readonly boxes: ReadonlyMap<string, LayoutBox>;
    shownAs(key: string): string;
  } | null;
  viewport: React.RefObject<HTMLElement | null>;
  bringIntoView: CanvasInput["bringIntoView"];
}) {
  const { nodes, placed, viewport, bringIntoView } = props;
  // The cards the keyboard moves through: those shown, not hidden in a
  // collapsed box, in note order; the one in the Tab order.
  const order = React.useMemo(() => {
    if (!placed) return [];
    return nodes
      .filter((node) => {
        const key: TaskMapBoxKey = taskKey(node.task.id);
        return placed.shownAs(key) === key && placed.boxes.has(key);
      })
      .sort((a, b) => a.position - b.position)
      .map((node) => node.task.id);
  }, [nodes, placed]);
  const [keyed, setKeyed] = React.useState<TaskId | null>(null);
  const current =
    keyed !== null && order.includes(keyed) ? keyed : (order[0] ?? null);
  const roving = React.useCallback<Roving>((id) => id === current, [current]);
  /** The card of task `id` on the canvas, the head's for a box. */
  const cardOf = (id: TaskId) =>
    viewport.current?.querySelector<HTMLElement>(
      `.nextaction-task-map-world [data-map-key="${taskKey(id)}"] .nextaction-task-card`,
    ) ?? null;
  const showCard = (id: TaskId) => {
    const box = placed?.boxes.get(taskKey(id));
    if (box) bringIntoView(box);
  };
  /** The task whose card `target` is, or `null`. */
  const cardTask = (target: EventTarget | null): TaskId | null => {
    if (!(target instanceof Element)) return null;
    if (!target.classList.contains("nextaction-task-card")) return null;
    if (!target.closest(".nextaction-task-map-world")) return null;
    const key = target.closest<HTMLElement>("[data-map-key]")?.dataset.mapKey;
    return key?.startsWith("task:") ? Number(key.slice(5)) : null;
  };
  /**
   * Tab past the last card, or Shift+Tab before the first: to the view's
   * header controls (the first, or the last), never out of the plugin panel.
   */
  const leaveCards = (back: boolean): boolean => {
    const header = viewport.current
      ?.closest(".nextaction-task-map")
      ?.querySelector(".nextaction-view-header");
    const controls = [
      ...(header?.querySelectorAll<HTMLElement>(focusable) ?? []),
    ].filter((element) => element.getClientRects().length > 0);
    const to = back ? controls.at(-1) : controls[0];
    if (!to) return false;
    to.focus();
    return true;
  };
  /** The canvas's focus handler: a card focused is where Tab goes on from. */
  const onCardFocus = (event: React.FocusEvent<HTMLElement>) => {
    // A card focused, by click or by keyboard, is the one Tab goes on from;
    // by keyboard it is panned into the window (#221).
    const id = cardTask(event.target);
    if (id === null) return;
    setKeyed(id);
    if ((event.target as Element).matches(":focus-visible")) showCard(id);
  };
  /** Tab on a card, handled: `true` when the key was a card's Tab. */
  const onCardKey = (event: React.KeyboardEvent<HTMLElement>): boolean => {
    if (event.key !== "Tab" || event.ctrlKey || event.altKey || event.metaKey) {
      return false;
    }
    const id = cardTask(event.target);
    if (id === null) return false;
    const at = order.indexOf(id);
    const next = order[at + (event.shiftKey ? -1 : 1)];
    if (at >= 0 && next !== undefined) {
      event.preventDefault();
      setKeyed(next);
      // Focusable now: tabbable or not, a card with onOpen takes the focus.
      cardOf(next)?.focus({ preventScroll: true });
      return true;
    }
    if (leaveCards(event.shiftKey)) event.preventDefault();
    return true;
  };
  return { roving, setKeyed, onCardFocus, onCardKey };
}
