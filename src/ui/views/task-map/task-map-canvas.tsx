// The task map's canvas (#213): the read map measured, laid out
// (domain/task-map/layout.ts, ADR 0027) and drawn. Cards are measured first,
// in a hidden layer outside the transform, at their fixed width; then every
// box and card is placed absolutely inside its own box, as the layout gives
// them relative to their container. One CSS transform on the world pans and
// zooms (canvas-input.ts); an SVG layer above the cards draws the sequence
// and dependency arrows (#215). A dependency is drawn from a card's connector
// (task-map-links.tsx) and selected by a click on its arrow, deleted with
// Delete or from its right-click menu (#219). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
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
import {
  createMemoryStore,
  type MemoryStore,
} from "../../components/memory-store";
import { ContextMenu } from "../../components/popup-controls";
import { projectStatusLabel } from "../../components/project-status-label";
import { TaskCard } from "../../components/task-card";
import type { TaskActions } from "../../hooks/use-task-actions";
import { projectStatusIcons } from "../../project-menu/project-status-icons";
import type { TaskMenuItems, TaskMenuPlace } from "../../task-menu/menu-items";
import { useCanvasInput } from "./canvas-input";
import { type DependencyBadge, dependencyBadges } from "./dependency-badge";
import { DependencyBadgeButton } from "./dependency-popover";
import { SequentialToggle } from "./sequential-toggle";
import { mapDropAttributes, useMapCardDrag } from "./task-map-drag";
import { useTaskMapEdits } from "./task-map-edits";
import {
  LinkAreaProvider,
  LinkConnector,
  type LinkDrag,
  LinkPreview,
  linkTargetAttributes,
} from "./task-map-links";
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
      // A box's head switches sequential (#220).
      buttons={
        node.children.length > 0 ? (
          <SequentialToggle task={node.task} />
        ) : undefined
      }
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
  badges: ReadonlyMap<TaskId, DependencyBadge>;
  deps: CardDeps;
  /** Its parent task is sequential (#216: where a drop on it goes). */
  inSequence?: boolean;
}) {
  const { node, layout, badges, deps } = props;
  const box = layout.get(taskKey(node.task.id));
  const drag = useMapCardDrag(node.task);
  const drop = mapDropAttributes(node.task, props.inSequence ?? false);
  const badge = badges.get(node.task.id);
  const badgeButton = badge && (
    <DependencyBadgeButton node={node} badge={badge} />
  );
  if (node.children.length === 0) {
    return (
      <div
        {...drag}
        {...drop}
        {...linkTargetAttributes(node.task)}
        className="nextaction-task-map-card"
        data-next-action={node.nextAction || undefined}
        data-cycle={node.cycle || undefined}
        style={placeStyle(box)}
      >
        <MapCard node={node} deps={deps} />
        {badgeButton}
        <LinkConnector task={node.task} />
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
        {...linkTargetAttributes(node.task)}
        className="nextaction-task-map-head"
        data-next-action={node.nextAction || undefined}
        data-cycle={node.cycle || undefined}
      >
        <MapCard node={node} deps={deps} />
        {badgeButton}
        <LinkConnector task={node.task} />
      </div>
      {node.children.map((child) => (
        <MapNode
          key={child.task.id}
          node={child}
          layout={layout}
          badges={badges}
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

/** Where arrows meet the nodes on the world: level with their cards. */
interface Anchors {
  /** Where an arrow out of the node starts: just right of it. */
  exit(id: TaskId): { x: number; y: number } | null;
  /** Where an arrow into the node ends: just left of it. */
  entry(id: TaskId): { x: number; y: number } | null;
}

function anchorsOf(
  boxes: ReadonlyMap<string, LayoutBox>,
  heads: Sizes,
): Anchors {
  const level = (id: TaskId, box: LayoutBox) => {
    const head = heads.get(id);
    return head
      ? box.y + boxPadding.top + head.height / 2
      : box.y + box.height / 2;
  };
  return {
    exit(id) {
      const box = boxes.get(taskKey(id));
      return box ? { x: box.x + box.width + 4, y: level(id, box) } : null;
    },
    entry(id) {
      const box = boxes.get(taskKey(id));
      return box ? { x: box.x - 4, y: level(id, box) } : null;
    },
  };
}

/** A dependency, by its two ends. */
export interface EdgeKey {
  readonly from: TaskId;
  readonly to: TaskId;
}

const sameEdge = (a: EdgeKey | null, b: EdgeKey | null) =>
  a === b || (!!a && !!b && a.from === b.from && a.to === b.to);

/**
 * The arrows, from a node's right side to the next one's left: the sequence
 * arrows thin and faint, then the dependencies (#215), those in a date
 * conflict and on a cycle last so no plain line covers them. Under each
 * dependency a wide transparent line takes its clicks (#219): a click
 * selects it, a right-click opens its menu.
 */
function Arrows(props: {
  edges: readonly TaskMapEdge[];
  dependencies: readonly TaskMapDependencyEdge[];
  anchors: Anchors;
  width: number;
  height: number;
  selected: EdgeKey | null;
  onSelect: (edge: EdgeKey) => void;
  onDelete: (edge: EdgeKey) => void;
}) {
  const prefix = `nextaction-task-map-arrow-${React.useId().replace(/:/g, "")}`;
  const { MenuText } = orca.components;
  const path = (edge: TaskMapEdge) => {
    const start = props.anchors.exit(edge.from);
    const end = props.anchors.entry(edge.to);
    if (!start || !end) return null;
    const { x: x0, y: y0 } = start;
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
  const svg = (openMenu?: (event: React.MouseEvent, edge: EdgeKey) => void) => (
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
        if (!d) return null;
        const key = { from: edge.from, to: edge.to };
        return (
          <g key={`dependency-${edge.from}-${edge.to}`}>
            <path
              className="nextaction-task-map-arrow"
              data-kind={kind}
              data-any={edge.any || undefined}
              data-selected={sameEdge(props.selected, key) || undefined}
              d={d}
              markerEnd={`url(#${prefix}-${kind})`}
            />
            {openMenu && (
              // The pointer's way to an arrow; the dependency is also edited
              // in the task panel, by keyboard too.
              // biome-ignore lint/a11y/noStaticElementInteractions: see above
              <path
                className="nextaction-task-map-arrow-hit"
                d={d}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onSelect(key);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  props.onSelect(key);
                  openMenu(event, key);
                }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
  return (
    <ContextMenu
      menu={(close, edge?: EdgeKey) => (
        <MenuText
          title={t("Delete dependency")}
          preIcon="ti ti-trash"
          dangerous
          onClick={() => {
            close();
            if (edge) props.onDelete(edge);
          }}
        />
      )}
    >
      {(open) => svg((event, edge) => open(event, edge))}
    </ContextMenu>
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
  // "Any" and "+N days" where a dependent's arrows come in (#220).
  const badges = React.useMemo(
    () => dependencyBadges(nodes, read.dependencyEdges),
    [nodes, read],
  );
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
    return { layout, boxes: worldBoxes(read, layout), root, heads };
  }, [read, sizes, nodes]);

  const content = React.useMemo(
    () =>
      placed ? { width: placed.root.width, height: placed.root.height } : null,
    [placed],
  );
  const input = useCanvasInput({ viewport, world, store, content });
  const anchors = React.useMemo(
    () => placed && anchorsOf(placed.boxes, placed.heads),
    [placed],
  );

  // Drawing a dependency (#219): the drag in a store, so a move renders the
  // preview only.
  const [linkDrag] = React.useState(() =>
    createMemoryStore<LinkDrag | null>(null),
  );
  const tasks = React.useMemo(
    () => new Map(nodes.map((node) => [node.task.id, node.task])),
    [nodes],
  );
  const { toWorld } = input;
  const linkArea = React.useMemo(
    () => ({ drag: linkDrag, viewport, toWorld, tasks }),
    [linkDrag, toWorld, tasks],
  );

  // The dependency selected by a click on its arrow (#219): Delete removes it.
  const edits = useTaskMapEdits();
  const [selectedEdge, setSelectedEdge] = React.useState<EdgeKey | null>(null);
  const deleteEdge = React.useCallback(
    (edge: EdgeKey) => {
      const dependent = tasks.get(edge.to);
      if (!edits || !dependent) return;
      setSelectedEdge(null);
      void edits.removeDependency(dependent, edge.from);
    },
    [edits, tasks],
  );
  const selectEdge = React.useCallback((edge: EdgeKey) => {
    setSelectedEdge(edge);
    viewport.current?.focus({ preventScroll: true });
  }, []);
  // A selected dependency gone from the map (deleted, or in the notes).
  const shownEdge =
    selectedEdge &&
    read.dependencyEdges.some((edge) => sameEdge(edge, selectedEdge))
      ? selectedEdge
      : null;
  const handlers: React.HTMLAttributes<HTMLElement> = {
    ...input.handlers,
    onPointerDown(event) {
      // A press anywhere but on an arrow lets go of the arrow selected.
      if (
        event.button === 0 &&
        !(
          event.target instanceof Element &&
          event.target.closest(".nextaction-task-map-arrow-hit")
        )
      ) {
        setSelectedEdge(null);
      }
      input.handlers.onPointerDown?.(event);
    },
    onKeyDown(event) {
      if (
        shownEdge &&
        (event.key === "Delete" || event.key === "Backspace") &&
        event.target === event.currentTarget
      ) {
        event.preventDefault();
        deleteEdge(shownEdge);
        return;
      }
      if (shownEdge && event.key === "Escape") setSelectedEdge(null);
      input.handlers.onKeyDown?.(event);
    },
  };

  return (
    <section
      ref={viewport}
      className="nextaction-task-map-viewport"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas takes F and Space to fit and pan (#213)
      tabIndex={0}
      aria-label={t("Task map")}
      {...handlers}
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
      <LinkAreaProvider value={linkArea}>
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
                    badges={badges}
                    deps={deps}
                  />
                ))}
              </section>
            ))}
          {placed && anchors && (
            <Arrows
              edges={read.sequenceEdges}
              dependencies={read.dependencyEdges}
              anchors={anchors}
              width={placed.root.width}
              height={placed.root.height}
              selected={shownEdge}
              onSelect={selectEdge}
              onDelete={deleteEdge}
            />
          )}
          {placed && anchors && (
            <LinkPreview
              drag={linkDrag}
              anchor={anchors.exit}
              width={placed.root.width}
              height={placed.root.height}
            />
          )}
        </div>
      </LinkAreaProvider>
    </section>
  );
}
