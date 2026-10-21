// The task map's layout (GLOSSARY: 任务全景图, ADR 0027): where every card
// and box goes, worked out afresh from the task relations on every read and
// never saved. Pure; no DOM, no Orca, no time; synchronous on the main
// thread (docs/spikes/task-map-elk.md: about 4 ms for 800 tasks).
//
// Box by box, bottom up (the spike's rules): every edge is lifted to the two
// children of its ends' lowest common box that hold them, and only orders
// those children left to right; children take layers by the longest path
// over those edges, a cycle broken at its earliest child in note order; a
// layer holds its children top to bottom in note order, each pulled toward
// the centre of its predecessors but never above the child before it. No
// crossing minimisation, no edge routing: the interface draws the edges.

/** Space between layers, left to right. */
export const gapX = 48;
/** Space between siblings stacked top to bottom. */
export const gapY = 16;

export interface LayoutSize {
  readonly width: number;
  readonly height: number;
}

export interface LayoutPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** A card with no box around it: its size as the interface measured it. */
export interface LayoutLeaf extends LayoutSize {
  readonly kind: "leaf";
  readonly id: string;
}

/**
 * A box (a project's, the no-project area's, a parent task's): its head on
 * top, its children below it, given in note order. A collapsed box is given
 * with no children.
 */
export interface LayoutContainer {
  readonly kind: "container";
  readonly id: string;
  /** The head's size: a parent task's card, a project's title; may be 0. */
  readonly head: LayoutSize;
  readonly padding: LayoutPadding;
  readonly children: readonly LayoutNode[];
}

export type LayoutNode = LayoutLeaf | LayoutContainer;

/**
 * An edge between two nodes anywhere in the tree, read left to right: a
 * sequence edge between adjacent subtasks, or a dependency (from the task
 * depended on to the dependent). An end not in the tree, an edge within one
 * node's own subtree, and an edge from a node to itself only change nothing.
 */
export interface LayoutEdge {
  readonly from: string;
  readonly to: string;
}

/** Where a node goes: relative to its container's top left, and its size. */
export interface LayoutBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Lays out `root` and everything in it: each node relative to its
 * container, the root at 0, 0.
 */
export function layoutTaskMap(
  root: LayoutNode,
  edges: readonly LayoutEdge[],
): ReadonlyMap<string, LayoutBox> {
  const parentOf = new Map<string, string>();
  const walk = (node: LayoutNode) => {
    if (node.kind === "leaf") return;
    for (const child of node.children) {
      parentOf.set(child.id, node.id);
      walk(child);
    }
  };
  walk(root);
  const lifted = liftEdges(root.id, parentOf, edges);
  const out = new Map<string, LayoutBox>();
  const size = place(root, lifted, out);
  out.set(root.id, { x: 0, y: 0, ...size });
  return out;
}

/**
 * The edges lifted to the boxes they order: by box, the pairs of its
 * children holding the two ends, each pair once.
 */
function liftEdges(
  rootId: string,
  parentOf: ReadonlyMap<string, string>,
  edges: readonly LayoutEdge[],
): Map<string, Map<string, Set<string>>> {
  const inTree = (id: string) => id === rootId || parentOf.has(id);
  /** The node and its containers, nearest first. */
  const path = (id: string) => {
    const out = [id];
    for (let at = parentOf.get(id); at !== undefined; at = parentOf.get(at)) {
      out.push(at);
    }
    return out;
  };
  const lifted = new Map<string, Map<string, Set<string>>>();
  for (const edge of edges) {
    if (!inTree(edge.from) || !inTree(edge.to)) continue;
    const a = path(edge.from);
    const b = path(edge.to);
    const inB = new Set(b);
    const at = a.findIndex((id) => inB.has(id));
    const common = a[at];
    const from = a[at - 1];
    const to = b[b.indexOf(common as string) - 1];
    if (common === undefined || from === undefined || to === undefined) {
      continue;
    }
    let pairs = lifted.get(common);
    if (!pairs) {
      pairs = new Map();
      lifted.set(common, pairs);
    }
    let targets = pairs.get(from);
    if (!targets) {
      targets = new Set();
      pairs.set(from, targets);
    }
    targets.add(to);
  }
  return lifted;
}

/** Lays out what is in `node`, returning its size. */
function place(
  node: LayoutNode,
  lifted: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
  out: Map<string, LayoutBox>,
): LayoutSize {
  if (node.kind === "leaf") return { width: node.width, height: node.height };
  const { padding, head, children } = node;
  const sizes = children.map((child) => place(child, lifted, out));
  const layer = layersOf(children, lifted.get(node.id));
  const preds = predecessorsOf(children, lifted.get(node.id));
  const top = padding.top + head.height;
  const layers: number[][] = [];
  layer.forEach((at, i) => {
    let list = layers[at];
    if (!list) {
      list = [];
      layers[at] = list;
    }
    list.push(i);
  });
  const centreY: number[] = [];
  let x = padding.left;
  let right = padding.left + head.width;
  let bottom = top;
  for (const indices of layers) {
    if (!indices) continue;
    let cursor = top;
    let width = 0;
    for (const i of indices) {
      const size = sizes[i] as LayoutSize;
      const before = (preds[i] ?? []).filter(
        (p) => (layer[p] ?? 0) < (layer[i] ?? 0),
      );
      let y = cursor;
      if (before.length > 0) {
        const mean =
          before.reduce((sum, p) => sum + (centreY[p] ?? 0), 0) / before.length;
        y = Math.max(cursor, mean - size.height / 2);
      }
      out.set((children[i] as LayoutNode).id, { x, y, ...size });
      centreY[i] = y + size.height / 2;
      cursor = y + size.height + gapY;
      width = Math.max(width, size.width);
      bottom = Math.max(bottom, y + size.height);
    }
    right = Math.max(right, x + width);
    x += width + gapX;
  }
  return { width: right + padding.right, height: bottom + padding.bottom };
}

/** By child index, the indices of the children with an edge into it. */
function predecessorsOf(
  children: readonly LayoutNode[],
  pairs: ReadonlyMap<string, ReadonlySet<string>> | undefined,
): number[][] {
  const index = new Map(children.map((child, i) => [child.id, i]));
  const preds: number[][] = children.map(() => []);
  for (const [from, targets] of pairs ?? []) {
    const i = index.get(from);
    if (i === undefined) continue;
    for (const to of targets) {
      const j = index.get(to);
      if (j !== undefined) preds[j]?.push(i);
    }
  }
  return preds;
}

/**
 * By child index, its layer: the longest path over the edges into it, taken
 * in note order; on a cycle, the earliest child left is taken as if ready.
 */
function layersOf(
  children: readonly LayoutNode[],
  pairs: ReadonlyMap<string, ReadonlySet<string>> | undefined,
): number[] {
  const preds = predecessorsOf(children, pairs);
  const succs: number[][] = children.map(() => []);
  preds.forEach((list, j) => {
    for (const i of list) succs[i]?.push(j);
  });
  const waiting = preds.map((list) => list.length);
  const layer = children.map(() => 0);
  const done = children.map(() => false);
  const ready: number[] = [];
  waiting.forEach((count, i) => {
    if (count === 0) ready.push(i);
  });
  let left = children.length;
  let earliest = 0;
  while (left > 0) {
    if (ready.length === 0) {
      while (done[earliest]) earliest++;
      ready.push(earliest);
    }
    ready.sort((a, b) => a - b);
    const i = ready.shift() as number;
    if (done[i]) continue;
    done[i] = true;
    left--;
    for (const p of preds[i] ?? []) {
      if (done[p]) layer[i] = Math.max(layer[i] ?? 0, (layer[p] ?? 0) + 1);
    }
    for (const s of succs[i] ?? []) {
      if (done[s]) continue;
      waiting[s] = (waiting[s] ?? 0) - 1;
      if (waiting[s] === 0) ready.push(s);
    }
  }
  return layer;
}
