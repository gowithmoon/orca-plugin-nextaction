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
 * What a drop on a block writes. So far (#123) a new block before the
 * target from the upper half of its row, after it from the lower half; an
 * edge lies within its half. Inline references, root blocks and expanded
 * blocks follow in #125, mirrors in #126.
 */
export function resolveNoteDrop(facts: NoteDropFacts): NoteDropPlan {
  const upper = facts.zone === "topEdge" || facts.zone === "upperHalf";
  return {
    kind: "newBlock",
    content: facts.mode,
    placement: upper ? "before" : "after",
  };
}
