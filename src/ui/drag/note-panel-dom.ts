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
  /** The block is the panel's root block (a journal's or page's title). */
  readonly root: boolean;
  /**
   * The block's element is taller than its row: it shows child blocks
   * (`.orca-block`'s box holds them, drag-to-note). Not used before #125,
   * which checks it in Orca.
   */
  readonly expanded: boolean;
}

/** The block's own row: `.orca-block > .orca-repr > .orca-repr-main`. */
function rowOf(block: Element): Element {
  return block.querySelector(":scope > .orca-repr > .orca-repr-main") ?? block;
}

/** Orca's cursor data at the point, or `null` (drag-to-note 落点). */
function cursorAt(x: number, y: number): CursorData | null {
  const range = document.caretRangeFromPoint(x, y) ?? undefined;
  if (!range) return null;
  try {
    return orca.utils.getCursorDataFromRange(range);
  } catch (error) {
    console.warn("[nextaction] no cursor data at the drop point", error);
    return null;
  }
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
  const cursor = cursorAt(x, y);
  if (!cursor || cursor.panelId !== panelId) return null;
  const row = rowOf(block).getBoundingClientRect();
  return {
    target: {
      panelId,
      rootBlockId: cursor.rootBlockId,
      blockId,
      caret: cursor,
    },
    row,
    zone: zoneAt(row, y),
    inlineCaret: cursor.anchor.isInline && cursor.anchor.blockId === blockId,
    root: blockId === cursor.rootBlockId,
    expanded: block.getBoundingClientRect().height > row.height + 1,
  };
}
