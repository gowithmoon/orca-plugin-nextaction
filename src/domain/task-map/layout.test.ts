import { describe, expect, it } from "vitest";
import {
  type LayoutBox,
  type LayoutContainer,
  type LayoutEdge,
  type LayoutLeaf,
  layoutTaskMap,
} from "./layout";

function leaf(id: string, width = 100, height = 40): LayoutLeaf {
  return { kind: "leaf", id, width, height };
}

function box(
  id: string,
  children: LayoutContainer["children"],
  head = { width: 100, height: 40 },
  padding = { top: 8, right: 8, bottom: 8, left: 8 },
): LayoutContainer {
  return { kind: "container", id, head, padding, children };
}

function placed(layout: ReadonlyMap<string, LayoutBox>, id: string): LayoutBox {
  const found = layout.get(id);
  if (!found) throw new Error(`${id} not laid out`);
  return found;
}

describe("task map layout", () => {
  it("stacks a container's children top to bottom in note order, below its head", () => {
    const layout = layoutTaskMap(
      box("p", [leaf("a"), leaf("b", 100, 60), leaf("c")]),
      [],
    );

    // Padding 8 + head 40 = 48; gaps of 16 between siblings.
    expect(placed(layout, "a")).toEqual({
      x: 8,
      y: 48,
      width: 100,
      height: 40,
    });
    expect(placed(layout, "b")).toEqual({
      x: 8,
      y: 104,
      width: 100,
      height: 60,
    });
    expect(placed(layout, "c")).toEqual({
      x: 8,
      y: 180,
      width: 100,
      height: 40,
    });
  });

  it("sizes a container to hold its head and every child, padding around them", () => {
    const wideHead = layoutTaskMap(
      box("p", [leaf("a", 100, 40)], { width: 240, height: 30 }),
      [],
    );
    // 8 + 240 + 8 wide; 8 + 30 + 40 + 8 high.
    expect(placed(wideHead, "p")).toEqual({
      x: 0,
      y: 0,
      width: 256,
      height: 86,
    });

    const wideChild = layoutTaskMap(
      box("p", [leaf("a", 300, 40), leaf("b", 100, 20)], {
        width: 100,
        height: 30,
      }),
      [],
    );
    // 8 + 300 + 8 wide; 8 + 30 + 40 + 16 + 20 + 8 high.
    expect(placed(wideChild, "p")).toEqual({
      x: 0,
      y: 0,
      width: 316,
      height: 122,
    });
  });

  it("lines up a sequential container's children left to right along its sequence edges", () => {
    const layout = layoutTaskMap(
      box("p", [leaf("a", 100, 40), leaf("b", 120, 60), leaf("c", 100, 40)]),
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    );

    // Gaps of 48 between layers; each card pulled toward the centre of the
    // one before it, never above the head: c's centre on b's (48 + 30).
    expect(placed(layout, "a")).toEqual({
      x: 8,
      y: 48,
      width: 100,
      height: 40,
    });
    expect(placed(layout, "b")).toEqual({
      x: 156,
      y: 48,
      width: 120,
      height: 60,
    });
    expect(placed(layout, "c")).toEqual({
      x: 324,
      y: 58,
      width: 100,
      height: 40,
    });
    // 8 + 100 + 48 + 120 + 48 + 100 + 8 wide; 48 + 60 + 8 high.
    expect(placed(layout, "p")).toEqual({
      x: 0,
      y: 0,
      width: 432,
      height: 116,
    });
  });

  it("starts a chain's later layer below the earlier cards when the chain skips none", () => {
    // a → c only: b sits in a's layer, below a, in note order.
    const layout = layoutTaskMap(box("p", [leaf("a"), leaf("b"), leaf("c")]), [
      { from: "a", to: "c" },
    ]);

    expect(placed(layout, "a")).toMatchObject({ x: 8, y: 48 });
    expect(placed(layout, "b")).toMatchObject({ x: 8, y: 104 });
    expect(placed(layout, "c")).toMatchObject({ x: 156, y: 48 });
  });

  it("lets a dependency between cards in different boxes order the boxes that hold them", () => {
    // b (in q) depends on a (in p): q goes right of p, both in the root.
    const layout = layoutTaskMap(
      box("root", [box("q", [leaf("b")]), box("p", [leaf("a")])]),
      [{ from: "a", to: "b" }],
    );

    expect(placed(layout, "p")).toMatchObject({ x: 8, y: 48 });
    // p is 116 wide: 8 + 116 + 48.
    expect(placed(layout, "q")).toMatchObject({ x: 172, y: 48 });
  });

  it("layers dependencies left to right by the longest path, a shortcut edge not pulling a card back", () => {
    // c depends on a and on b; b depends on a: c goes two layers right.
    const layout = layoutTaskMap(box("p", [leaf("c"), leaf("b"), leaf("a")]), [
      { from: "a", to: "c" },
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);

    expect(placed(layout, "a")).toMatchObject({ x: 8 });
    expect(placed(layout, "b")).toMatchObject({ x: 156 });
    expect(placed(layout, "c")).toMatchObject({ x: 304 });
  });

  it("orders boxes by the dependencies lifted from deep inside them, each pair of boxes once", () => {
    // In the root, p holds a parent task box pa holding a; q holds b and c,
    // both depending on a: q goes right of p.
    const layout = layoutTaskMap(
      box("root", [
        box("q", [leaf("b"), leaf("c")]),
        box("p", [box("pa", [leaf("a")])]),
      ]),
      [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
      ],
    );

    expect(placed(layout, "p")).toMatchObject({ x: 8, y: 48 });
    // p: 8 + pa (8 + 100 + 8) + 8 = 132 wide; 8 + 132 + 48.
    expect(placed(layout, "q")).toMatchObject({ x: 188 });
    // Inside q, b and c share a layer: nothing between them orders them.
    expect(placed(layout, "b")).toMatchObject({ x: 8, y: 48 });
    expect(placed(layout, "c")).toMatchObject({ x: 8, y: 104 });
  });

  it("still lays out every child of a box when its edges make a cycle", () => {
    const layout = layoutTaskMap(box("p", [leaf("a"), leaf("b"), leaf("c")]), [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
      { from: "b", to: "c" },
    ]);

    // Broken at a, the earliest: a, then b, then c.
    expect(placed(layout, "a")).toMatchObject({ x: 8 });
    expect(placed(layout, "b")).toMatchObject({ x: 156 });
    expect(placed(layout, "c")).toMatchObject({ x: 304 });
  });

  it("lays out 1600 cards with 2000 edges within a generous time", () => {
    const projects: LayoutContainer[] = [];
    const ids: string[] = [];
    for (let p = 0; p < 40; p++) {
      const parents: LayoutContainer[] = [];
      for (let q = 0; q < 8; q++) {
        const cards = Array.from({ length: 5 }, (_, i) => {
          const id = `t${p}-${q}-${i}`;
          ids.push(id);
          return leaf(id, 240, 56);
        });
        parents.push(box(`t${p}-${q}`, cards));
      }
      projects.push(box(`p${p}`, parents));
    }
    const edges: LayoutEdge[] = Array.from({ length: 2000 }, (_, i) => ({
      from: ids[(i * 7) % ids.length] as string,
      to: ids[(i * 13 + 5) % ids.length] as string,
    }));

    const started = performance.now();
    const layout = layoutTaskMap(box("root", projects), edges);

    expect(performance.now() - started).toBeLessThan(500);
    expect(layout.size).toBe(1 + 40 + 320 + 1600);
  });

  it("sizes an empty container to its head", () => {
    const layout = layoutTaskMap(box("p", [], { width: 120, height: 30 }), []);

    expect(placed(layout, "p")).toEqual({ x: 0, y: 0, width: 136, height: 46 });
  });

  it("lays out a single card on its own", () => {
    const layout = layoutTaskMap(leaf("a", 240, 56), []);

    expect([...layout]).toEqual([
      ["a", { x: 0, y: 0, width: 240, height: 56 }],
    ]);
  });

  it("nests boxes in boxes, each child relative to its own container", () => {
    const layout = layoutTaskMap(
      box("root", [
        box("p", [box("q", [leaf("a", 100, 40)])], { width: 100, height: 40 }),
        leaf("b", 100, 40),
      ]),
      [],
    );

    // q holds a: 8 + 100 + 8 wide, 8 + 40 + 40 + 8 high.
    expect(placed(layout, "a")).toEqual({
      x: 8,
      y: 48,
      width: 100,
      height: 40,
    });
    expect(placed(layout, "q")).toEqual({
      x: 8,
      y: 48,
      width: 116,
      height: 96,
    });
    // p holds q: 8 + 116 + 8 wide, 48 + 96 + 8 high.
    expect(placed(layout, "p")).toEqual({
      x: 8,
      y: 48,
      width: 132,
      height: 152,
    });
    // b below p: 48 + 152 + 16.
    expect(placed(layout, "b")).toEqual({
      x: 8,
      y: 216,
      width: 100,
      height: 40,
    });
  });
});
