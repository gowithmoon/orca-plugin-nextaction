/**
 * Orca's cursor data at a place in a note panel's text, as `infra` gives it
 * (#122): opaque outside `infra`, which alone reads it (drag-to-note 落点).
 * `ui` and `application` only hand it on.
 */
export type NoteCaret = { readonly __brand: "NoteCaret" };

/** What Orca says about a place in a note panel's text. */
export interface NoteCursor {
  /** The note panel the place is in. */
  readonly panelId: string;
  /** That panel's root block: the journal or page it shows. */
  readonly rootBlockId: number;
  /** The block the caret is in. */
  readonly blockId: number;
  /** The caret is in the block's text (Orca's `isInline`). */
  readonly inline: boolean;
  readonly caret: NoteCaret;
}

/**
 * Turns a place in the DOM into Orca's cursor data there (drag-to-note:
 * `getCursorDataFromRange`), for `ui` to find a drop's note panel, root
 * block and inline caret without calling Orca itself (docs/ARCHITECTURE.md
 * §4 界面注入). `null` where Orca gives none (a block's empty space, the
 * empty space below the last block); never throws.
 */
export interface NoteCursorSource {
  cursorAt(range: Range): NoteCursor | null;
}
