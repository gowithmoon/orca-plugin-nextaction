// The task map's canvas (#213): the read map measured, laid out
// (domain/task-map/layout.ts, ADR 0027) and drawn. Cards are measured first,
// in a hidden layer outside the transform, at their fixed width; then every
// box and card is placed absolutely inside its own box, as the layout gives
// them relative to their container. One CSS transform on the world pans and
// zooms (canvas-input.ts); an SVG layer above the cards draws the sequence
// and dependency arrows (#215).
//
// A click on a card's blank space (not its text, which opens the task panel,
// nor its buttons) selects it: its chain (task-map-chain.ts) is highlighted,
// the rest faded; a click on blank canvas or Esc clears it (#218). A box
// collapses to its head (domain/task-map/collapse.ts), the arrows into and
// out of it attached to it. Laid out again, the card last pressed (or the
// selected one) keeps its place on screen, the view shifted to make up for
// it, and the rest moves there in a short transition. Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  TaskMapArea,
  TaskMapDependencyEdge,
  TaskMapEdge,
  TaskMapNode,
  TaskMapRead,
} from "../../../application/usecases/read-task-map";
import { taskMapChain } from "../../../application/usecases/task-map-chain";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
import { collapseLayout } from "../../../domain/task-map/collapse";
import {
  type LayoutBox,
  type LayoutContainer,
  type LayoutNode,
  layoutTaskMap,
} from "../../../domain/task-map/layout";
import { t } from "../../../shared/l10n/l10n";
import { projectStatusLabel } from "../../components/project-status-label";
import { selectsText } from "../../components/selects-text";
import { TaskCard } from "../../components/task-card";
import type { TaskActions } from "../../hooks/use-task-actions";
import { projectStatusIcons } from "../../project-menu/project-status-icons";
import type { TaskMenuItems, TaskMenuPlace } from "../../task-menu/menu-items";
import { useCanvasInput } from "./canvas-input";
import { type DependencyBadge, dependencyBadges } from "./dependency-badge";
import { DependencyBadgeButton } from "./dependency-popover";
import { SequentialToggle } from "./sequential-toggle";
import { mapDropAttributes, useMapCardDrag } from "./task-map-drag";
import type { TaskMapStores } from "./task-map-stores";

/** Every card's width (#213: fixed, the text up to two lines). */
export const cardWidth = 240;
/** A project's and the no-project area's head: its icon and name. */
const areaHeadHeight = 32;
const boxPadding = { top: 8, right: 12, bottom: 12, left: 12 };
const rootId = "root";

const taskKey = (id: TaskId) => `task:${id}`;
export function areaKey(area: TaskMapArea): string {
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

/** The highlight and the collapsed boxes, as the map shows them (#218). */
interface Look {
  /** Something is selected: what is not in its chain is faded. */
  readonly highlighting: boolean;
  /** The node or box `key` (a layout ID) shows part of the chain. */
  lit(key: string): boolean;
  /** The task selected, `null` for none. */
  readonly selected: TaskId | null;
  select(id: TaskId): void;
  isCollapsed(key: string): boolean;
  toggle(key: string): void;
}

/** Faded while highlighting, for a node not showing the chain. */
function dimAttribute(look: Look, key: string) {
  return look.highlighting && !look.lit(key) ? "" : undefined;
}

/** A click on these on a card is theirs: it selects nothing. */
const ownClick = [
  ".nextaction-task-card-text",
  "button",
  "a",
  "input",
  '[role="button"]',
].join(", ");

/**
 * The click handlers of an element holding a card: a click on the card's
 * blank space selects `id`, the task panel not opened; the drag's own
 * capture (the click ending a drag opens nothing) goes first.
 */
function selectOnBlank(
  id: TaskId,
  look: Look,
  drag: React.HTMLAttributes<HTMLElement>,
): React.MouseEventHandler<HTMLElement> {
  return (event) => {
    drag.onClickCapture?.(event);
    if (event.isPropagationStopped()) return;
    const { target } = event;
    // React bubbles clicks out of portals: a menu's is not on the card.
    if (!(target instanceof Element)) return;
    if (!event.currentTarget.contains(target)) return;
    if (!target.closest(".nextaction-task-card")) return;
    if (target.closest(ownClick)) return;
    if (selectsText(event.currentTarget)) return;
    event.stopPropagation();
    look.select(id);
  };
}

function CollapseToggle(props: { collapsed: boolean; onToggle: () => void }) {
  const { Tooltip } = orca.components;
  const label = props.collapsed ? t("Expand") : t("Collapse");
  return (
    <Tooltip text={label}>
      <button
        type="button"
        className="nextaction-task-card-button nextaction-task-card-extra nextaction-task-map-collapse"
        data-on={props.collapsed || undefined}
        aria-expanded={!props.collapsed}
        aria-label={label}
        onClick={(event) => {
          // Not a click on the card: that opens the task panel.
          event.stopPropagation();
          props.onToggle();
        }}
      >
        <i
          className={
            props.collapsed ? "ti ti-chevron-right" : "ti ti-chevron-down"
          }
          aria-hidden="true"
        />
      </button>
    </Tooltip>
  );
}

function MapCard(props: {
  node: TaskMapNode;
  deps: CardDeps;
  /** A box's head: whether it is collapsed, and toggling it. */
  collapse?: { collapsed: boolean; onToggle: () => void };
}) {
  const { node, deps, collapse } = props;
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
          <>
            <SequentialToggle task={node.task} />
            <CollapseToggle
              collapsed={collapse?.collapsed ?? false}
              onToggle={collapse?.onToggle ?? (() => {})}
            />
          </>
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
  look: Look;
  /** Its parent task is sequential (#216: where a drop on it goes). */
  inSequence?: boolean;
}) {
  const { node, layout, badges, deps, look } = props;
  const key = taskKey(node.task.id);
  const box = layout.get(key);
  const drag = useMapCardDrag(node.task);
  const onClickCapture = selectOnBlank(node.task.id, look, drag);
  const chosen = look.selected === node.task.id || undefined;
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
        onClickCapture={onClickCapture}
        className="nextaction-task-map-card"
        data-map-key={key}
        data-next-action={node.nextAction || undefined}
        data-cycle={node.cycle || undefined}
        data-dim={dimAttribute(look, key)}
        data-chosen={chosen}
        style={placeStyle(box)}
      >
        <MapCard node={node} deps={deps} />
        {badgeButton}
      </div>
    );
  }
  const collapsed = look.isCollapsed(key);
  return (
    <div
      {...drop}
      className="nextaction-task-map-box"
      data-map-key={key}
      data-sequential={node.sequential || undefined}
      data-collapsed={collapsed || undefined}
      style={placeStyle(box)}
    >
      <div
        {...drag}
        onClickCapture={onClickCapture}
        className="nextaction-task-map-head"
        data-next-action={node.nextAction || undefined}
        data-cycle={node.cycle || undefined}
        data-dim={dimAttribute(look, key)}
        data-chosen={chosen}
      >
        <MapCard
          node={node}
          deps={deps}
          collapse={{ collapsed, onToggle: () => look.toggle(key) }}
        />
        {badgeButton}
      </div>
      {!collapsed &&
        node.children.map((child) => (
          <MapNode
            key={child.task.id}
            node={child}
            layout={layout}
            badges={badges}
            deps={deps}
            look={look}
            inSequence={node.sequential}
          />
        ))}
    </div>
  );
}

function AreaHead(props: { area: TaskMapArea; look: Look }) {
  const { area, look } = props;
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
  const key = areaKey(area);
  const collapsed = look.isCollapsed(key);
  return (
    <div
      className="nextaction-task-map-area-head"
      title={name}
      data-dim={collapsed ? dimAttribute(look, key) : undefined}
    >
      <CollapseToggle collapsed={collapsed} onToggle={() => look.toggle(key)} />
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
  boxes: ReadonlyMap<string, LayoutBox>;
  heads: Sizes;
  width: number;
  height: number;
  /** Where a task's arrows meet: its node, or the collapsed box hiding it. */
  shownAs: (key: string) => string;
  /** While highlighting, the edges of the chain; `null` when not. */
  lit: ReadonlySet<TaskMapEdge> | null;
}) {
  const { shownAs, lit } = props;
  /** The node an arrow meets for task `id`: its key and its task, if one. */
  const end = (id: TaskId) => {
    const key = shownAs(taskKey(id));
    const box = props.boxes.get(key);
    const task = key.startsWith("task:") ? Number(key.slice(5)) : undefined;
    return box ? { box, task } : null;
  };
  const dim = (edge: TaskMapEdge) => (lit && !lit.has(edge) ? "" : undefined);
  const prefix = `nextaction-task-map-arrow-${React.useId().replace(/:/g, "")}`;
  /** Where on a node's side an arrow meets it: level with its card. */
  const level = (at: { box: LayoutBox; task: TaskId | undefined }) => {
    const head = at.task === undefined ? undefined : props.heads.get(at.task);
    return head
      ? at.box.y + boxPadding.top + head.height / 2
      : at.box.y + at.box.height / 2;
  };
  const path = (edge: TaskMapEdge) => {
    const from = end(edge.from);
    const to = end(edge.to);
    // Both ends hidden in one collapsed box: no arrow.
    if (!from || !to || from.box === to.box) return null;
    const x0 = from.box.x + from.box.width + 4;
    const y0 = level(from);
    // Just left of the node it goes into, level with its card.
    const x3 = to.box.x - 4;
    const y3 = level(to);
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
            data-dim={dim(edge)}
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
            data-dim={dim(edge)}
            d={d}
            markerEnd={`url(#${prefix}-${kind})`}
          />
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

/** How long the cards take to move to where a new layout puts them. */
const relayoutMs = 240;

/**
 * Every box that collapses on the map: the project boxes and the parent
 * tasks' boxes (#218; the no-project area does not).
 */
export function taskMapBoxKeys(read: TaskMapRead): string[] {
  const keys = read.areas.flatMap((area) =>
    area.kind === "project" ? [areaKey(area)] : [],
  );
  for (const node of allNodes(read)) {
    if (node.children.length > 0) keys.push(taskKey(node.task.id));
  }
  return keys;
}

export function TaskMapCanvas(props: {
  read: TaskMapRead;
  stores: TaskMapStores;
  deps: CardDeps;
}) {
  const { read, stores, deps } = props;
  const viewport = React.useRef<HTMLElement | null>(null);
  const world = React.useRef<HTMLDivElement | null>(null);
  const measure = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useMemo(() => allNodes(read), [read]);
  // "Any" and "+N days" where a dependent's arrows come in (#220).
  const badges = React.useMemo(
    () => dependencyBadges(nodes, read.dependencyEdges),
    [nodes, read],
  );
  const collapsed = React.useSyncExternalStore(
    stores.collapsed.subscribe,
    stores.collapsed.current,
  );
  const picked = React.useSyncExternalStore(
    stores.selected.subscribe,
    stores.selected.current,
  );
  // A task no longer on the map is selected no more.
  const selected =
    picked !== null && nodes.some((node) => node.task.id === picked)
      ? picked
      : null;
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
    // Dependencies order the layers too, lifted across boxes (ADR 0027);
    // those into a collapsed box attached to it (#218).
    const folded = collapseLayout(
      input,
      edgeInput([...read.sequenceEdges, ...read.dependencyEdges]),
      collapsed,
    );
    const layout = layoutTaskMap(folded.root, folded.edges);
    const root = layout.get(rootId);
    if (!root) return null;
    // The boxes' head cards, for where arrows meet a box.
    const heads = new Map<TaskId, { width: number; height: number }>();
    for (const node of nodes) {
      const size = sizes.get(node.task.id);
      if (node.children.length > 0 && size) heads.set(node.task.id, size);
    }
    const boxes = worldBoxes(read, layout);
    return { layout, boxes, root, heads, shownAs: folded.shownAs };
  }, [read, sizes, nodes, collapsed]);

  // The chain of the task selected (#218), and the nodes showing it: a
  // collapsed box hiding part of it shows it.
  const chain = React.useMemo(
    () => (selected === null ? null : taskMapChain(read, selected)),
    [read, selected],
  );
  const look = React.useMemo((): Look => {
    const lit = new Set<string>();
    if (chain && placed) {
      for (const id of chain.tasks) lit.add(placed.shownAs(taskKey(id)));
    }
    return {
      highlighting: chain !== null,
      lit: (key) => lit.has(key),
      selected,
      select: (id) => stores.selected.set(id),
      isCollapsed: (key) => collapsed.has(key),
      toggle: (key) => stores.collapsed.toggle(key),
    };
  }, [chain, placed, selected, collapsed, stores]);
  const litEdges = React.useMemo(
    () => (chain ? new Set<TaskMapEdge>(chain.edges) : null),
    [chain],
  );

  const content = React.useMemo(
    () =>
      placed ? { width: placed.root.width, height: placed.root.height } : null,
    [placed],
  );
  const input = useCanvasInput({
    viewport,
    world,
    store: stores.view,
    content,
  });

  // Laid out again (#218): the card last pressed, or else the one selected,
  // stays where it is on screen, the view shifted by as much as it moved;
  // everything moves there together in a transition (task-map-style.ts),
  // the world's shift and the boxes' moves timed alike so it stays put.
  const pressed = React.useRef<string | null>(null);
  const before = React.useRef<typeof placed>(null);
  const selectedRef = React.useRef(selected);
  selectedRef.current = selected;
  const { shift } = input;
  React.useLayoutEffect(() => {
    if (!placed) return;
    const previous = before.current;
    before.current = placed;
    const element = world.current;
    if (!previous || previous === placed || !element) return;
    const anchor =
      pressed.current ??
      (selectedRef.current === null ? null : taskKey(selectedRef.current));
    element.setAttribute("data-relayout", "");
    const timer = setTimeout(
      () => element.removeAttribute("data-relayout"),
      relayoutMs,
    );
    if (anchor !== null) {
      const from = previous.boxes.get(previous.shownAs(anchor));
      const to = placed.boxes.get(placed.shownAs(anchor));
      if (from && to) shift(from.x - to.x, from.y - to.y);
    }
    return () => clearTimeout(timer);
  }, [placed, shift]);

  const handlers: React.HTMLAttributes<HTMLElement> = {
    ...input.handlers,
    onPointerDownCapture(event) {
      const { target } = event;
      const key =
        target instanceof Element
          ? target.closest<HTMLElement>("[data-map-key]")?.dataset.mapKey
          : undefined;
      pressed.current = key ?? null;
    },
    onClick(event) {
      // A click on blank canvas clears the selection; a click in a portal
      // (a menu, a popover) is not on the canvas.
      const { target } = event;
      if (!(target instanceof Element)) return;
      if (!event.currentTarget.contains(target)) return;
      if (
        target.closest(
          ".nextaction-task-map-card, .nextaction-task-map-head, .nextaction-task-map-area-head",
        )
      ) {
        return;
      }
      stores.selected.set(null);
    },
    onKeyDown(event) {
      if (event.key === "Escape" && stores.selected.current() !== null) {
        if (!event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault();
        stores.selected.set(null);
        return;
      }
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
      <div
        ref={world}
        className="nextaction-task-map-world"
        data-highlighting={look.highlighting || undefined}
        style={input.worldStyle}
      >
        {placed &&
          read.areas.map((area) => {
            const key = areaKey(area);
            const folded = look.isCollapsed(key);
            return (
              <section
                key={key}
                className="nextaction-task-map-area"
                data-kind={area.kind}
                data-map-key={key}
                data-collapsed={folded || undefined}
                style={placeStyle(placed.layout.get(key))}
              >
                <AreaHead area={area} look={look} />
                {!folded &&
                  area.tasks.map((node) => (
                    <MapNode
                      key={node.task.id}
                      node={node}
                      layout={placed.layout}
                      badges={badges}
                      deps={deps}
                      look={look}
                    />
                  ))}
              </section>
            );
          })}
        {placed && (
          <Arrows
            edges={read.sequenceEdges}
            dependencies={read.dependencyEdges}
            boxes={placed.boxes}
            heads={placed.heads}
            width={placed.root.width}
            height={placed.root.height}
            shownAs={placed.shownAs}
            lit={litEdges}
          />
        )}
      </div>
    </section>
  );
}
