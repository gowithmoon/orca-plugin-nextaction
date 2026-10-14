import { describe, expect, it } from "vitest";
import { type NoteDropFacts, resolveNoteDrop } from "./note-drop";

/** A reference dropped on a plain, collapsed block, with no inline caret. */
function refDrop(facts: Partial<NoteDropFacts>): NoteDropFacts {
  return {
    mode: "ref",
    zone: "upperHalf",
    inlineCaret: false,
    root: false,
    expanded: false,
    ...facts,
  };
}

describe("note drop", () => {
  it("puts a reference dropped on the upper half of a block's row in a new block before it", () => {
    expect(resolveNoteDrop(refDrop({ zone: "upperHalf" }))).toEqual({
      kind: "newBlock",
      content: "ref",
      placement: "before",
    });
  });

  it("puts a reference dropped on the lower half of a block's row in a new block after it", () => {
    expect(resolveNoteDrop(refDrop({ zone: "lowerHalf" }))).toEqual({
      kind: "newBlock",
      content: "ref",
      placement: "after",
    });
  });
});
