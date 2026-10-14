// Everything a drag out of the plugin panel reads from a note panel's DOM
// lives in this file only (#122): which note panel and block lie under the
// pointer, the block's own row, and Orca's cursor data there. It depends on
// Orca's internal structure (`.orca-panel[data-panel-id]`,
// `.orca-block[data-id] > .orca-repr > .orca-repr-main`), which is no public
// API: check it by hand in Orca after every Orca upgrade (drag-to-note).
import type { NoteTarget } from "../../application/ports/task-repository";
import type { NoteDropZone } from "../../domain/blocking/note-drop";
import type { CursorData } from "../../orca.d.ts";

/** How close to the top or bottom of a block's row counts as its edge (#122). */
const edgePx = 6;
/** The plugin panel is an `.orca-panel` too, told apart by this inside it. */
const pluginPanelSelector = ".nextaction-panel";

/** What lies under the pointer in a note panel: a block to drop on. */
export interface NoteDropProbe {
  readonly target: NoteTarget;
  /** The block's own row on screen, without its expanded children. */
  readonly row: DOMRect;
  readonly zone: NoteDropZone;
  /** The cursor data at the pointer was inline, in the block's text. */
  readonly inlineCaret: boolean;
  /**
   * Where the inline caret is on screen, for the insertion caret to show;
   * `null` without an inline caret or when the browser gives it no box.
   */
  readonly caretBox: DOMRect | null;
  /** The block is the panel's root block (a journal's or page's title). */
  readonly root: boolean;
  /**
   * The block's element is taller than its row: it shows child blocks
   * (`.orca-block`'s box holds them, drag-to-note). To check by hand in
   * Orca (#125).
   */
  readonly expanded: boolean;
}

/** The block's own row: `.orca-block > .orca-repr > .orca-repr-main`. */
function rowOf(block: Element): Element {
  return block.querySelector(":scope > .orca-repr > .orca-repr-main") ?? block;
}

/**
 * Orca's cursor data at the point (drag-to-note 落点), and the caret's box
 * on screen from the same range, or `null`.
 */
function cursorAt(
  x: number,
  y: number,
): { cursor: CursorData; box: DOMRect | null } | null {
  const range = document.caretRangeFromPoint(x, y) ?? undefined;
  if (!range) return null;
  try {
    const cursor = orca.utils.getCursorDataFromRange(range);
    if (!cursor) return null;
    const box = range.getBoundingClientRect();
    // A collapsed range can come without a box (e.g. in an empty block).
    return { cursor, box: box.height > 0 ? box : null };
  } catch (error) {
    console.warn("[nextaction] no cursor data at the drop point", error);
    return null;
  }
}

/**
 * What scrolls the note panel under the point, for a drag to scroll it near
 * its top and bottom, or `null` (not over a note panel, or nothing scrolls).
 * The nearest element from the point up, inside the panel, that scrolls
 * vertically and can: found by computed style, not by an Orca class, which
 * drag-to-note did not measure. Check it by hand in Orca (#125).
 */
export function noteScrollerAt(x: number, y: number): HTMLElement | null {
  const element = document.elementFromPoint(x, y);
  const panel = element?.closest<HTMLElement>(".orca-panel[data-panel-id]");
  if (!element || !panel || panel.querySelector(pluginPanelSelector)) {
    return null;
  }
  for (
    let at: Element | null = element;
    at && panel.contains(at);
    at = at.parentElement
  ) {
    const { overflowY } = getComputedStyle(at);
    const scrolls = overflowY === "auto" || overflowY === "scroll";
    if (scrolls && at.scrollHeight > at.clientHeight) return at as HTMLElement;
  }
  return null;
}

function zoneAt(row: DOMRect, y: number): NoteDropZone {
  if (y < row.top + edgePx) return "topEdge";
  if (y > row.bottom - edgePx) return "bottomEdge";
  return y < (row.top + row.bottom) / 2 ? "upperHalf" : "lowerHalf";
}

/**
 * The block of a note panel under the point, or `null`: over the plugin
 * panel, the empty space below a panel's last block
 * (`.orca-block-editor-placeholder`, no block), or anywhere else. The
 * cursor data there gives the panel's root block (drag-to-note); without
 * it the drop is no drop, as measured.
 */
export function probeNoteDrop(x: number, y: number): NoteDropProbe | null {
  const element = document.elementFromPoint(x, y);
  const panel = element?.closest<HTMLElement>(".orca-panel[data-panel-id]");
  if (!element || !panel || panel.querySelector(pluginPanelSelector)) {
    return null;
  }
  const block = element.closest<HTMLElement>(".orca-block[data-id]");
  if (!block || !panel.contains(block)) return null;
  const blockId = Number(block.dataset.id);
  const panelId = panel.dataset.panelId;
  if (!Number.isInteger(blockId) || !panelId) return null;
  const found = cursorAt(x, y);
  if (!found || found.cursor.panelId !== panelId) return null;
  const { cursor } = found;
  const inlineCaret =
    cursor.anchor.isInline && cursor.anchor.blockId === blockId;
  const row = rowOf(block).getBoundingClientRect();
  return {
    target: {
      panelId,
      rootBlockId: cursor.rootBlockId,
      blockId,
      // Only an inline caret in this block is written at (NoteTarget).
      caret: inlineCaret ? cursor : null,
    },
    row,
    zone: zoneAt(row, y),
    inlineCaret,
    caretBox: inlineCaret ? found.box : null,
    root: blockId === cursor.rootBlockId,
    expanded: block.getBoundingClientRect().height > row.height + 1,
  };
}
