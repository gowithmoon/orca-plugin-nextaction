// Everything a drag out of the plugin panel reads from a note panel's DOM
// lives in this file only (#122): which note panel and block lie under the
// pointer, the block's own row, and the DOM range there for Orca's cursor
// data (through NoteCursorSource, from infra). It depends on Orca's
// internal structure (`.orca-panel[data-panel-id]`,
// `.orca-block[data-id] > .orca-repr > .orca-repr-main`), which is no public
// API: check it by hand in Orca after every Orca upgrade (drag-to-note).
import type {
  NoteCursor,
  NoteCursorSource,
} from "../../application/ports/note-cursor";
import type { NoteTarget } from "../../application/ports/task-repository";
import type { NoteDropZone } from "../../domain/blocking/note-drop";

/** How close to the top or bottom of a block's row counts as its edge (#122). */
const edgePx = 6;
/** The plugin panel is an `.orca-panel` too, told apart by this inside it. */
const pluginPanelSelector = ".nextaction-panel";
/** How many blocks, from the dropped-on one out, are tried for the root block. */
const rootProbeDepth = 8;

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

/** The cursor data at the point (drag-to-note 落点), and the caret's box on screen. */
function cursorAt(
  cursors: NoteCursorSource,
  x: number,
  y: number,
): { cursor: NoteCursor; box: DOMRect | null } | null {
  const range = document.caretRangeFromPoint(x, y);
  if (!range) return null;
  const cursor = cursors.cursorAt(range);
  if (!cursor) return null;
  const box = range.getBoundingClientRect();
  // A collapsed range can come without a box (e.g. in an empty block).
  return { cursor, box: box.height > 0 ? box : null };
}

/**
 * The panel's root block without a cursor at the point (e.g. a drop on a
 * block's empty space): from the cursor data at the start of the first text
 * in the dropped-on block's row, or else in the nearest block around it in
 * the same panel. Every cursor data in a panel carries that panel's
 * `rootBlockId` (drag-to-note 落点). That Orca gives cursor data for a
 * range the plugin makes, not one the browser gives at a point, is not
 * measured: to check by hand in Orca (#125). `null` without it: no drop.
 */
function rootBlockOf(
  cursors: NoteCursorSource,
  panel: HTMLElement,
  panelId: string,
  block: HTMLElement,
): number | null {
  let at: HTMLElement | null = block;
  for (let tried = 0; at && tried < rootProbeDepth; tried += 1) {
    const text = document
      .createTreeWalker(rowOf(at), NodeFilter.SHOW_TEXT)
      .nextNode();
    if (text) {
      const range = document.createRange();
      range.setStart(text, 0);
      range.collapse(true);
      const cursor = cursors.cursorAt(range);
      if (cursor?.panelId === panelId) return cursor.rootBlockId;
    }
    const outer: HTMLElement | null | undefined =
      at.parentElement?.closest<HTMLElement>(".orca-block[data-id]");
    at = outer && panel.contains(outer) ? outer : null;
  }
  return null;
}

/**
 * The note panel under the point and the element there, or `null`: over
 * the plugin panel, or over no panel.
 */
function notePanelAt(
  x: number,
  y: number,
): { element: Element; panel: HTMLElement } | null {
  const element = document.elementFromPoint(x, y);
  const panel = element?.closest<HTMLElement>(".orca-panel[data-panel-id]");
  if (!element || !panel || panel.querySelector(pluginPanelSelector)) {
    return null;
  }
  return { element, panel };
}

/**
 * What scrolls the note panel under the point, for a drag to scroll it near
 * its top and bottom, or `null` (not over a note panel, or nothing scrolls).
 * The nearest element from the point up, inside the panel, that scrolls
 * vertically and can: found by computed style, not by an Orca class, which
 * drag-to-note did not measure. Check it by hand in Orca (#125).
 */
export function noteScrollerAt(x: number, y: number): HTMLElement | null {
  const found = notePanelAt(x, y);
  if (!found) return null;
  const { element, panel } = found;
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
 * cursor data at the point gives the panel's root block and the inline
 * caret (drag-to-note). Without it the root block comes from `rootBlockOf`
 * and there is no inline caret: the drop makes a new block by halves (#125).
 */
export function probeNoteDrop(
  cursors: NoteCursorSource,
  x: number,
  y: number,
): NoteDropProbe | null {
  const found = notePanelAt(x, y);
  if (!found) return null;
  const { element, panel } = found;
  const block = element.closest<HTMLElement>(".orca-block[data-id]");
  if (!block || !panel.contains(block)) return null;
  const blockId = Number(block.dataset.id);
  const panelId = panel.dataset.panelId;
  if (!Number.isInteger(blockId) || !panelId) return null;
  const at = cursorAt(cursors, x, y);
  const cursor = at?.cursor.panelId === panelId ? at.cursor : null;
  const rootBlockId =
    cursor?.rootBlockId ?? rootBlockOf(cursors, panel, panelId, block);
  if (rootBlockId === null) return null;
  const caret = cursor?.inline && cursor.blockId === blockId ? cursor : null;
  const row = rowOf(block).getBoundingClientRect();
  return {
    target: {
      panelId,
      rootBlockId,
      blockId,
      // Only an inline caret in this block is written at (NoteTarget).
      caret: caret?.caret ?? null,
    },
    row,
    zone: zoneAt(row, y),
    inlineCaret: caret !== null,
    caretBox: caret ? (at?.box ?? null) : null,
    root: blockId === rootBlockId,
    expanded: block.getBoundingClientRect().height > row.height + 1,
  };
}
