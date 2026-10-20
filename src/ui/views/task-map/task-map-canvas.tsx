// The task map's canvas (#213): the read map measured, laid out
// (domain/task-map/layout.ts, ADR 0027) and drawn. Cards are measured first,
// in a hidden layer outside the transform, at their fixed width; then every
// box and card is placed absolutely inside its own box, as the layout gives
// them relative to their container. One CSS transform on the world pans and
// zooms (canvas-input.ts); an SVG layer above the cards draws the sequence
// and dependency arrows (#215). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  TaskMapArea,
  TaskMapDependencyEdge,
  TaskMapEdge,
  TaskMapNode,
  TaskMapRead,
} from "../../../application/usecases/read-task-map";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
import {
  type LayoutBox,
  type LayoutContainer,
  type LayoutNode,
  layoutTaskMap,
} from "../../../domain/task-map/layout";
import { t } from "../../../shared/l10n/l10n";
import type { MemoryStore } from "../../components/memory-store";
import { projectStatusLabel } from "../../components/project-status-label";
import { TaskCard } from "../../components/task-card";
import type { TaskActions } from "../../hooks/use-task-actions";
import { projectStatusIcons } from "../../project-menu/project-status-icons";
import type { TaskMenuItems, TaskMenuPlace } from "../../task-menu/menu-items";
import { useCanvasInput } from "./canvas-input";
import { mapDropAttributes, useMapCardDrag } from "./task-map-drag";
import type { CanvasView } from "./task-map-stores";

/** Every card's width (#213: fixed, the text up to two lines). */
export const cardWidth = 240;
/** A project's and the no-project area's head: its icon and name. */
const areaHeadHeight = 32;
const boxPadding = { top: 8, right: 12, bottom: 12, left: 12 };
const rootId = "root";

const taskKey = (id: TaskId) => `task:${id}`;
function areaKey(area: TaskMapArea): string {
  return area.kind === "project" ? `project:${area.project.id}` : "no-project";
}

type Sizes = ReadonlyMap<TaskId, { width: number; height: number }>;

/** The layout's input: the areas below the root, each its task trees. */
function layoutInput(read: TaskMapRead, sizes: Sizes): LayoutContainer | null {
  let missing = false;
  const node = (item: TaskMapNode): LayoutNode => {
    const size = sizes.get(item.task.id);
    if (!size) missing = true;
    const measured = size ?? { width: cardWidth, height: 0 };
    if (item.children.length === 0) {
      return { kind: "leaf", id: taskKey(item.task.id), ...measured };
    }
    return {
      kind: "container",
      id: taskKey(item.task.id),
      head: measured,
      padding: boxPadding,
      children: item.children.map(node),
    };
  };
  const root: LayoutContainer = {
    kind: "container",
    id: rootId,
    head: { width: 0, height: 0 },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    children: read.areas.map((area) => ({
      kind: "container",
      id: areaKey(area),
      head: { width: cardWidth, height: areaHeadHeight },
      padding: boxPadding,
      children: area.tasks.map(node),
    })),
  };
  return missing ? null : root;
}

function edgeInput(edges: readonly TaskMapEdge[]) {
  return edges.map((edge) => ({
    from: taskKey(edge.from),
    to: taskKey(edge.to),
  }));
}

/** Each node's box on the world: its container's offsets added up. */
function worldBoxes(
  read: TaskMapRead,
  layout: ReadonlyMap<string, LayoutBox>,
): Map<string, LayoutBox> {
  const out = new Map<string, LayoutBox>();
  const add = (id: string, x: number, y: number) => {
    const box = layout.get(id);
    if (!box) return null;
    const at = { ...box, x: x + box.x, y: y + box.y };
    out.set(id, at);
    return at;
  };
  const walk = (item: TaskMapNode, x: number, y: number) => {
    const at = add(taskKey(item.task.id), x, y);
    if (!at) return;
    for (const child of item.children) walk(child, at.x, at.y);
  };
  for (const area of read.areas) {
    const at = add(areaKey(area), 0, 0);
    if (!at) continue;
    for (const item of area.tasks) walk(item, at.x, at.y);
  }
  return out;
}

interface CardDeps {
  today: CalendarDate;
  actions: TaskActions;
  menuItems: TaskMenuItems | undefined;
  menuPlace: TaskMenuPlace;
  selectTask: (id: TaskId) => void;
  selectedTaskId: TaskId | undefined;
}

function MapCard(props: { node: TaskMapNode; deps: CardDeps }) {
  const { node, deps } = props;
  const { done, total } = node.subtasks;
  return (
    <TaskCard
      task={node.task}
      today={deps.today}
      actions={deps.actions}
      menuItems={deps.menuItems}
      menuPlace={deps.menuPlace}
      onOpen={(task) => deps.selectTask(task.id)}
      selected={node.task.id === deps.selectedTaskId}
      blocked={node.blocked}
      kept={node.faded}
      keptStatusShown={false}
      footer={
        total > 0 ? (
          <span className="nextaction-task-map-count">
            {t("${done}/${total} done", {
              done: String(done),
              total: String(total),
            })}
          </span>
        ) : undefined
      }
    />
  );
}

function placeStyle(box: LayoutBox | undefined): React.CSSProperties {
  return box
    ? { left: box.x, top: box.y, width: box.width, height: box.height }
    : {};
}

function MapNode(props: {
  node: TaskMapNode;
  layout: ReadonlyMap<string, LayoutBox>;
  deps: CardDeps;
  /** Its parent task is sequential (#216: where a drop on it goes). */
  inSequence?: boolean;
}) {
  const { node, layout, deps } = props;
  const box = layout.get(taskKey(node.task.id));
  const drag = useMapCardDrag(node.task);
  const drop = mapDropAttributes(node.task, props.inSequence ?? false);
  if (node.children.length === 0) {
    return (
      <div
        {...drag}
        {...drop}
        className="nextaction-task-map-card"
        data-next-action={node.nextAction || undefined}
        data-cycle={node.cycle || undefined}
        style={placeStyle(box)}
      >
        <MapCard node={node} deps={deps} />
      </div>
    );
  }
  return (
    <div
      {...drop}
      className="nextaction-task-map-box"
      data-sequential={node.sequential || undefined}
      style={placeStyle(box)}
    >
      <div
        {...drag}
        className="nextaction-task-map-head"
        data-next-action={node.nextAction || undefined}
        data-cycle={node.cycle || undefined}
      >
        <MapCard node={node} deps={deps} />
      </div>
      {node.children.map((child) => (
        <MapNode
          key={child.task.id}
          node={child}
          layout={layout}
          deps={deps}
          inSequence={node.sequential}
        />
      ))}
    </div>
  );
}

function AreaHead(props: { area: TaskMapArea }) {
  const { area } = props;
  if (area.kind === "noProject") {
    return (
      <div className="nextaction-task-map-area-head">
        <i className="ti ti-folder-off" aria-hidden="true" />
        <span className="nextaction-task-map-area-name">{t("No project")}</span>
      </div>
    );
  }
  const icon = projectStatusIcons[area.project.status];
  const name = area.project.text.trim();
  return (
    <div className="nextaction-task-map-area-head" title={name}>
      <i
        className={icon.className}
        style={{ color: icon.color }}
        aria-hidden="true"
      />
      <span
        className="nextaction-task-map-area-name"
        data-empty={name === "" || undefined}
      >
        <span className="nextaction-visually-hidden">
          {t("Project (${status}):", {
            status: projectStatusLabel(area.project.status),
          })}{" "}
        </span>
        {name === "" ? t("(No text)") : name}
      </span>
    </div>
  );
}

/** An arrow's kind: its line and its arrowhead's marker (#215). */
type ArrowKind = "sequence" | "dependency" | "conflict" | "cycle";
const arrowKinds: readonly ArrowKind[] = [
  "sequence",
  "dependency",
  "conflict",
  "cycle",
];

/** A dependency's kind: a cycle over a date conflict over a plain one. */
function dependencyKind(edge: TaskMapDependencyEdge): ArrowKind {
  if (edge.cycle) return "cycle";
  return edge.conflict ? "conflict" : "dependency";
}

/**
 * The arrows, from a node's right side to the next one's left: the sequence
 * arrows thin and faint, then the dependencies (#215), those in a date
 * conflict and on a cycle last so no plain line covers them.
 */
function Arrows(props: {
  edges: readonly TaskMapEdge[];
  dependencies: readonly TaskMapDependencyEdge[];
  delays: ReadonlyMap<TaskId, number>;
  boxes: ReadonlyMap<string, LayoutBox>;
  heads: Sizes;
  width: number;
  height: number;
}) {
  const prefix = `nextaction-task-map-arrow-${React.useId().replace(/:/g, "")}`;
  /** Where on a node's side an arrow meets it: level with its card. */
  const level = (id: TaskId, box: LayoutBox) => {
    const head = props.heads.get(id);
    return head
      ? box.y + boxPadding.top + head.height / 2
      : box.y + box.height / 2;
  };
  /** Where an arrow into the node ends: just left of it, level with its card. */
  const entry = (id: TaskId) => {
    const to = props.boxes.get(taskKey(id));
    return to ? { x: to.x - 4, y: level(id, to) } : null;
  };
  const path = (edge: TaskMapEdge) => {
    const from = props.boxes.get(taskKey(edge.from));
    const end = entry(edge.to);
    if (!from || !end) return null;
    const x0 = from.x + from.width + 4;
    const y0 = level(edge.from, from);
    const { x: x3, y: y3 } = end;
    const ctrl = Math.min(
      150,
      Math.max(20, Math.hypot(x3 - x0, y3 - y0) * 0.42),
    );
    return `M ${x0} ${y0} C ${x0 + ctrl} ${y0}, ${x3 - ctrl} ${y3}, ${x3} ${y3}`;
  };
  const rank: Record<ArrowKind, number> = {
    sequence: 0,
    dependency: 1,
    conflict: 2,
    cycle: 3,
  };
  const dependencies = [...props.dependencies].sort(
    (a, b) => rank[dependencyKind(a)] - rank[dependencyKind(b)],
  );
  return (
    <svg
      className="nextaction-task-map-edges"
      width={props.width}
      height={props.height}
      aria-hidden="true"
    >
      <defs>
        {arrowKinds.map((kind) => (
          <marker
            key={kind}
            id={`${prefix}-${kind}`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="8"
            markerHeight="8"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path
              d="M0 0.5 L7.5 4 L0 7.5 z"
              className="nextaction-task-map-arrow-head"
              data-kind={kind}
            />
          </marker>
        ))}
      </defs>
      {props.edges.map((edge) => {
        const d = path(edge);
        return d ? (
          <path
            key={`sequence-${edge.from}-${edge.to}`}
            className="nextaction-task-map-arrow"
            data-kind="sequence"
            d={d}
            markerEnd={`url(#${prefix}-sequence)`}
          />
        ) : null;
      })}
      {dependencies.map((edge) => {
        const d = path(edge);
        const kind = dependencyKind(edge);
        return d ? (
          <path
            key={`dependency-${edge.from}-${edge.to}`}
            className="nextaction-task-map-arrow"
            data-kind={kind}
            data-any={edge.any || undefined}
            d={d}
            markerEnd={`url(#${prefix}-${kind})`}
          />
        ) : null;
      })}
      {[...props.delays].map(([id, days]) => {
        const end = entry(id);
        return end ? (
          <text
            key={`delay-${id}`}
            className="nextaction-task-map-delay"
            x={end.x - 10}
            y={end.y - 6}
            textAnchor="end"
          >
            {t("+${days}d", { days: String(days) })}
          </text>
        ) : null;
      })}
    </svg>
  );
}

function allNodes(read: TaskMapRead): TaskMapNode[] {
  const out: TaskMapNode[] = [];
  const walk = (node: TaskMapNode) => {
    out.push(node);
    node.children.forEach(walk);
  };
  for (const area of read.areas) area.tasks.forEach(walk);
  return out;
}

export function TaskMapCanvas(props: {
  read: TaskMapRead;
  store: MemoryStore<CanvasView | null>;
  deps: CardDeps;
}) {
  const { read, store, deps } = props;
  const viewport = React.useRef<HTMLElement | null>(null);
  const world = React.useRef<HTMLDivElement | null>(null);
  const measure = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useMemo(() => allNodes(read), [read]);
  /** The cards' sizes, measured for `read`; `null` while measuring. */
  const [measured, setMeasured] = React.useState<{
    read: TaskMapRead;
    sizes: Sizes;
  } | null>(null);
  const measuring = measured?.read !== read;

  // Before paint, so the hidden layer never shows.
  React.useLayoutEffect(() => {
    if (!measuring || !measure.current) return;
    const sizes = new Map<TaskId, { width: number; height: number }>();
    for (const element of measure.current.querySelectorAll<HTMLElement>(
      "[data-task-id]",
    )) {
      sizes.set(Number(element.dataset.taskId), {
        width: element.offsetWidth,
        height: element.offsetHeight,
      });
    }
    setMeasured({ read, sizes });
  }, [measuring, read]);

  const sizes = measured?.sizes;
  const placed = React.useMemo(() => {
    if (!sizes) return null;
    const input = layoutInput(read, sizes);
    if (!input) return null;
    // Dependencies order the layers too, lifted across boxes (ADR 0027).
    const layout = layoutTaskMap(
      input,
      edgeInput([...read.sequenceEdges, ...read.dependencyEdges]),
    );
    const root = layout.get(rootId);
    if (!root) return null;
    // The boxes' head cards, for where arrows meet a box.
    const heads = new Map<TaskId, { width: number; height: number }>();
    for (const node of nodes) {
      const size = sizes.get(node.task.id);
      if (node.children.length > 0 && size) heads.set(node.task.id, size);
    }
    // "+N days" where a delayed task's dependency arrows come in.
    const delays = new Map<TaskId, number>();
    for (const node of nodes) {
      if (node.dependencyDelay > 0) {
        delays.set(node.task.id, node.dependencyDelay);
      }
    }
    return { layout, boxes: worldBoxes(read, layout), root, heads, delays };
  }, [read, sizes, nodes]);

  const content = React.useMemo(
    () =>
      placed ? { width: placed.root.width, height: placed.root.height } : null,
    [placed],
  );
  const input = useCanvasInput({ viewport, world, store, content });

  return (
    <section
      ref={viewport}
      className="nextaction-task-map-viewport"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas takes F and Space to fit and pan (#213)
      tabIndex={0}
      aria-label={t("Task map")}
      {...input.handlers}
    >
      {measuring && (
        <div
          ref={measure}
          className="nextaction-task-map-measure"
          aria-hidden="true"
        >
          {nodes.map((node) => (
            <div
              key={node.task.id}
              data-task-id={node.task.id}
              className="nextaction-task-map-card"
              data-next-action={node.nextAction || undefined}
            >
              <MapCard node={node} deps={deps} />
            </div>
          ))}
        </div>
      )}
      <div
        ref={world}
        className="nextaction-task-map-world"
        style={input.worldStyle}
      >
        {placed &&
          read.areas.map((area) => (
            <section
              key={areaKey(area)}
              className="nextaction-task-map-area"
              data-kind={area.kind}
              style={placeStyle(placed.layout.get(areaKey(area)))}
            >
              <AreaHead area={area} />
              {area.tasks.map((node) => (
                <MapNode
                  key={node.task.id}
                  node={node}
                  layout={placed.layout}
                  deps={deps}
                />
              ))}
            </section>
          ))}
        {placed && (
          <Arrows
            edges={read.sequenceEdges}
            dependencies={read.dependencyEdges}
            delays={placed.delays}
            boxes={placed.boxes}
            heads={placed.heads}
            width={placed.root.width}
            height={placed.root.height}
          />
        )}
      </div>
    </section>
  );
}
