// The NoteCursorSource port (#122): a place in a note panel's DOM to Orca's
// cursor data there, through `getCursorDataFromRange` (drag-to-note 落点).
// The only place that turns Orca's `CursorData` into the opaque `NoteCaret`
// and back.
import type {
  NoteCaret,
  NoteCursor,
  NoteCursorSource,
} from "../../application/ports/note-cursor";
import type { CursorData } from "../../orca.d.ts";

/** The opaque caret `ui` hands on, for Orca's cursor data. */
function toNoteCaret(cursor: CursorData): NoteCaret {
  return cursor as unknown as NoteCaret;
}

/** Orca's cursor data a `NoteCaret` stands for; every one comes from `toNoteCaret`. */
export function fromNoteCaret(caret: NoteCaret): CursorData {
  return caret as unknown as CursorData;
}

export const orcaNoteCursorSource: NoteCursorSource = {
  cursorAt(range: Range): NoteCursor | null {
    try {
      const cursor = orca.utils.getCursorDataFromRange(range);
      if (!cursor) return null;
      return {
        panelId: cursor.panelId,
        rootBlockId: cursor.rootBlockId,
        blockId: cursor.anchor.blockId,
        inline: cursor.anchor.isInline,
        caret: toNoteCaret(cursor),
      };
    } catch (error) {
      console.warn("[nextaction] no cursor data at the drop point", error);
      return null;
    }
  },
};
