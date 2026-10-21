// Collapsed boxes on the task map (#218): a project's or a parent task's box
// folded down to its head. Before laying out (layout.ts), the collapsed boxes
// lose their children, so each takes its head's size; an edge with an end
// hidden in one is attached to the outermost collapsed box holding it, and
// an edge with both ends hidden in the same box is dropped. Pure.
import type { LayoutEdge, LayoutNode } from "./layout";

export interface CollapsedLayout<E extends LayoutEdge> {
  /** The tree to lay out: every collapsed box with no children. */
  readonly root: LayoutNode;
  /** The edges, their hidden ends attached to the boxes holding them, in order. */
  readonly edges: readonly E[];
  /** Where a node is shown: itself, or the collapsed box hiding it. */
  shownAs(id: string): string;
}

export function collapseLayout<E extends LayoutEdge>(
  root: LayoutNode,
  edges: readonly E[],
  collapsed: ReadonlySet<string>,
): CollapsedLayout<E> {
  const hiddenIn = new Map<string, string>();
  const hide = (node: LayoutNode, box: string) => {
    hiddenIn.set(node.id, box);
    if (node.kind === "container") {
      for (const child of node.children) hide(child, box);
    }
  };
  const fold = (node: LayoutNode): LayoutNode => {
    if (node.kind === "leaf") return node;
    if (collapsed.has(node.id) && node.children.length > 0) {
      for (const child of node.children) hide(child, node.id);
      return { ...node, children: [] };
    }
    return { ...node, children: node.children.map(fold) };
  };
  const folded = fold(root);
  const shownAs = (id: string) => hiddenIn.get(id) ?? id;
  const attached: E[] = [];
  for (const edge of edges) {
    const from = shownAs(edge.from);
    const to = shownAs(edge.to);
    if (from === to) continue;
    attached.push(
      from === edge.from && to === edge.to ? edge : { ...edge, from, to },
    );
  }
  return { root: folded, edges: attached, shownAs };
}
