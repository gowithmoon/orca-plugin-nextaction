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

  it("puts a reference dropped on a block's text at the inline caret", () => {
    expect(
      resolveNoteDrop(refDrop({ zone: "upperHalf", inlineCaret: true })),
    ).toEqual({ kind: "inline" });
    expect(
      resolveNoteDrop(refDrop({ zone: "lowerHalf", inlineCaret: true })),
    ).toEqual({ kind: "inline" });
  });

  it("puts a reference dropped on the top edge of a block's row in a new block before it, even with an inline caret", () => {
    expect(
      resolveNoteDrop(refDrop({ zone: "topEdge", inlineCaret: true })),
    ).toEqual({ kind: "newBlock", content: "ref", placement: "before" });
  });

  it("puts a reference dropped on the bottom edge of a block's row in a new block after it, even with an inline caret", () => {
    expect(
      resolveNoteDrop(refDrop({ zone: "bottomEdge", inlineCaret: true })),
    ).toEqual({ kind: "newBlock", content: "ref", placement: "after" });
  });

  it.each(["topEdge", "bottomEdge", "upperHalf", "lowerHalf"] as const)(
    "puts a reference dropped on a panel's root block (%s) in its first child, never in the title's text",
    (zone) => {
      for (const inlineCaret of [false, true]) {
        for (const expanded of [false, true]) {
          expect(
            resolveNoteDrop(
              refDrop({ zone, root: true, inlineCaret, expanded }),
            ),
          ).toEqual({
            kind: "newBlock",
            content: "ref",
            placement: "firstChild",
          });
        }
      }
    },
  );

  it("puts a reference dropped on the bottom edge of a block that shows its children in its first child, right at the line", () => {
    expect(
      resolveNoteDrop(refDrop({ zone: "bottomEdge", expanded: true })),
    ).toEqual({ kind: "newBlock", content: "ref", placement: "firstChild" });
  });

  it("still puts a reference dropped on the top edge of a block that shows its children before it", () => {
    expect(
      resolveNoteDrop(refDrop({ zone: "topEdge", expanded: true })),
    ).toEqual({ kind: "newBlock", content: "ref", placement: "before" });
  });

  it("puts a reference dropped on the bottom edge of a collapsed block after it", () => {
    expect(
      resolveNoteDrop(refDrop({ zone: "bottomEdge", expanded: false })),
    ).toEqual({ kind: "newBlock", content: "ref", placement: "after" });
  });

  it("puts a reference dropped on the lower half of a block that shows its children, with no inline caret, in its first child", () => {
    expect(
      resolveNoteDrop(refDrop({ zone: "lowerHalf", expanded: true })),
    ).toEqual({ kind: "newBlock", content: "ref", placement: "firstChild" });
  });
});

/** A mirror dropped on a plain, collapsed block, with no inline caret. */
function mirrorDrop(facts: Partial<NoteDropFacts>): NoteDropFacts {
  return refDrop({ mode: "mirror", ...facts });
}

describe("note drop as a mirror", () => {
  it.each(["topEdge", "upperHalf"] as const)(
    "puts a mirror dropped on the upper half of a block's row (%s) in a new block before it",
    (zone) => {
      expect(resolveNoteDrop(mirrorDrop({ zone }))).toEqual({
        kind: "newBlock",
        content: "mirror",
        placement: "before",
      });
    },
  );

  it.each(["bottomEdge", "lowerHalf"] as const)(
    "puts a mirror dropped on the lower half of a block's row (%s) in a new block after it",
    (zone) => {
      expect(resolveNoteDrop(mirrorDrop({ zone }))).toEqual({
        kind: "newBlock",
        content: "mirror",
        placement: "after",
      });
    },
  );

  it("never puts a mirror dropped on a block's text inline, even with an inline caret", () => {
    expect(
      resolveNoteDrop(mirrorDrop({ zone: "upperHalf", inlineCaret: true })),
    ).toEqual({ kind: "newBlock", content: "mirror", placement: "before" });
    expect(
      resolveNoteDrop(mirrorDrop({ zone: "lowerHalf", inlineCaret: true })),
    ).toEqual({ kind: "newBlock", content: "mirror", placement: "after" });
  });

  it.each(["topEdge", "bottomEdge", "upperHalf", "lowerHalf"] as const)(
    "puts a mirror dropped on a panel's root block (%s) in its first child",
    (zone) => {
      for (const inlineCaret of [false, true]) {
        for (const expanded of [false, true]) {
          expect(
            resolveNoteDrop(
              mirrorDrop({ zone, root: true, inlineCaret, expanded }),
            ),
          ).toEqual({
            kind: "newBlock",
            content: "mirror",
            placement: "firstChild",
          });
        }
      }
    },
  );

  it.each(["bottomEdge", "lowerHalf"] as const)(
    "puts a mirror dropped on the lower half (%s) of a block that shows its children in its first child",
    (zone) => {
      expect(resolveNoteDrop(mirrorDrop({ zone, expanded: true }))).toEqual({
        kind: "newBlock",
        content: "mirror",
        placement: "firstChild",
      });
    },
  );

  it.each(["topEdge", "upperHalf"] as const)(
    "still puts a mirror dropped on the upper half (%s) of a block that shows its children before it",
    (zone) => {
      expect(resolveNoteDrop(mirrorDrop({ zone, expanded: true }))).toEqual({
        kind: "newBlock",
        content: "mirror",
        placement: "before",
      });
    },
  );
});
