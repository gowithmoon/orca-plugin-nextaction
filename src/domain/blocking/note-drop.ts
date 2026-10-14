// Dropping a task card on a block in a note panel (#122 "笔记落点的解析"):
// from what lies under the pointer, what to write there. Pure: `ui` finds
// the facts in the note panel, `infra` writes the plan. Sits beside the
// placements of moving a task (task-move.ts).

/** What a drop writes: a block reference to the task, or a mirror block of it. */
export type NoteDropMode = "ref" | "mirror";

/**
 * Where on the target block's own row the pointer is: within a few pixels
 * of its top or bottom edge (`ui` judges the width), or else its upper or
 * lower half. The block's row is its own line, not its expanded children.
 */
export type NoteDropZone = "topEdge" | "bottomEdge" | "upperHalf" | "lowerHalf";

/** The facts of a drop on a block in a note panel. */
export interface NoteDropFacts {
  readonly mode: NoteDropMode;
  readonly zone: NoteDropZone;
  /** An inline caret was found at the pointer, in the block's text. */
  readonly inlineCaret: boolean;
  /** The block is the panel's root block: a journal's or a page's title. */
  readonly root: boolean;
  /** The block shows its child blocks. */
  readonly expanded: boolean;
}

/** Where a new block goes, relative to the target block. */
export type NoteDropPlacement = "before" | "after" | "firstChild";

/**
 * What to write: a reference at the inline caret, or a new block holding
 * only a reference to the task, or a mirror of it, placed next to the
 * target block.
 */
export type NoteDropPlan =
  | { readonly kind: "inline" }
  | {
      readonly kind: "newBlock";
      readonly content: NoteDropMode;
      readonly placement: NoteDropPlacement;
    };

/**
 * What a drop on a block writes (#122, #125):
 * - on a panel's root block (a journal's or page's title): a new first
 *   child, whatever the mode and zone, never in the title's text;
 * - a reference on the block's text (not an edge) with an inline caret
 *   there: inline, at the caret;
 * - otherwise a new block: before from the top edge or upper half, after
 *   from the bottom edge or lower half, or the first child instead of after
 *   when the block shows its children, so it lands right at the line.
 * Mirrors (#126) take the same halves and never go inline.
 */
export function resolveNoteDrop(facts: NoteDropFacts): NoteDropPlan {
  if (facts.root) {
    return { kind: "newBlock", content: facts.mode, placement: "firstChild" };
  }
  const onText = facts.zone === "upperHalf" || facts.zone === "lowerHalf";
  if (facts.mode === "ref" && onText && facts.inlineCaret) {
    return { kind: "inline" };
  }
  const upper = facts.zone === "topEdge" || facts.zone === "upperHalf";
  const below = facts.expanded ? "firstChild" : "after";
  return {
    kind: "newBlock",
    content: facts.mode,
    placement: upper ? "before" : below,
  };
}
