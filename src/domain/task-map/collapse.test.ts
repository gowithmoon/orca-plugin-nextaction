import { describe, expect, it } from "vitest";
import { collapseLayout } from "./collapse";
import {
  type LayoutBox,
  type LayoutContainer,
  type LayoutLeaf,
  layoutTaskMap,
} from "./layout";

function leaf(id: string, width = 100, height = 40): LayoutLeaf {
  return { kind: "leaf", id, width, height };
}

function box(
  id: string,
  children: LayoutContainer["children"],
): LayoutContainer {
  return {
    kind: "container",
    id,
    head: { width: 100, height: 40 },
    padding: { top: 8, right: 8, bottom: 8, left: 8 },
    children,
  };
}

function placed(layout: ReadonlyMap<string, LayoutBox>, id: string): LayoutBox {
  const found = layout.get(id);
  if (!found) throw new Error(`${id} not laid out`);
  return found;
}

describe("collapsed boxes on the task map layout", () => {
  it("lays out a collapsed box at its head's size, what is in it not laid out", () => {
    const tree = box("root", [box("p", [leaf("a"), leaf("b")]), leaf("c")]);

    const collapsed = collapseLayout(tree, [], new Set(["p"]));
    const layout = layoutTaskMap(collapsed.root, collapsed.edges);

    // 8 + 100 + 8 wide, 8 + 40 + 8 high.
    expect(placed(layout, "p")).toEqual({
      x: 8,
      y: 48,
      width: 116,
      height: 56,
    });
    expect(layout.has("a")).toBe(false);
    // c right below p: 48 + 56 + 16.
    expect(placed(layout, "c")).toMatchObject({ x: 8, y: 120 });
  });

  it("attaches an edge into a collapsed box to the box, the box then ordered by it", () => {
    // c depends on b, inside p; d inside p depends on c.
    const tree = box("root", [leaf("c"), box("p", [leaf("b"), leaf("d")])]);
    const edges = [
      { from: "b", to: "c", kind: "dependency" },
      { from: "c", to: "d", kind: "dependency" },
    ];

    const collapsed = collapseLayout(tree, edges, new Set(["p"]));

    expect(collapsed.edges).toEqual([
      { from: "p", to: "c", kind: "dependency" },
      { from: "c", to: "p", kind: "dependency" },
    ]);
  });

  it("attaches an edge to the outermost collapsed box holding its end", () => {
    const tree = box("root", [box("p", [box("q", [leaf("a")])]), leaf("b")]);

    const collapsed = collapseLayout(
      tree,
      [{ from: "a", to: "b" }],
      new Set(["p", "q"]),
    );
    const layout = layoutTaskMap(collapsed.root, collapsed.edges);

    expect(collapsed.edges).toEqual([{ from: "p", to: "b" }]);
    expect(collapsed.shownAs("a")).toBe("p");
    // b goes right of p: 8 + 116 + 48.
    expect(placed(layout, "b")).toMatchObject({ x: 172 });
  });

  it("drops an edge whose two ends are both hidden in the same collapsed box", () => {
    const tree = box("root", [box("p", [leaf("a"), leaf("b")]), leaf("c")]);

    const collapsed = collapseLayout(
      tree,
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
      new Set(["p"]),
    );

    expect(collapsed.edges).toEqual([{ from: "p", to: "c" }]);
  });

  it("leaves everything as it is when nothing is collapsed", () => {
    const tree = box("root", [box("p", [leaf("a")]), leaf("b")]);
    const edges = [{ from: "a", to: "b" }];

    const collapsed = collapseLayout(tree, edges, new Set());

    expect(collapsed.root).toEqual(tree);
    expect(collapsed.edges).toEqual(edges);
    expect(collapsed.shownAs("a")).toBe("a");
  });
});
