// The task map's canvas (#213): the read map measured, laid out
// (domain/task-map/layout.ts, ADR 0027) and drawn. Cards are measured first,
// in a hidden layer outside the transform, at their fixed width; then every
// box and card is placed absolutely inside its own box, as the layout gives
// them relative to their container. One CSS transform on the world pans and
// zooms (canvas-input.ts); an SVG layer above the cards draws the sequence
// and dependency arrows (#215); a dependency whose other end is not on the
// map is an endpoint marker on the card instead (#217, endpoint-marker.tsx).
// A task an endpoint marker revealed is centered once laid out. A dependency
// is drawn from a card's connector (task-map-links.tsx) and selected by a
// click on its arrow, deleted with Delete or from its right-click menu
// (#219).
//
// A click on a card's blank space (not its text, which opens the task panel,
// nor its buttons) selects it: its chain (task-map-chain.ts) is highlighted,
// the rest faded; a click on blank canvas or Esc clears it (#218). A box
// collapses to its head (domain/task-map/collapse.ts), the arrows into and
// out of it attached to it. Laid out again, the card last pressed (or the
// selected one) keeps its place on screen, the view shifted to make up for
// it, and the rest moves there in a short transition. Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
//
// A task located (#221: the search box, "Show in task map") is centered, its
// collapsed boxes shown expanded for now (`stores.expanded`), and becomes the
// card the keyboard is on. The cards take the focus one at a time (roving
// tabindex): only that card is in the Tab order; Tab and Shift+Tab move it
// in note order, and past the last (or the first) card go to the header's
// controls, so the focus never leaves the plugin panel (task-map-canvas
// spike). The card focused by keyboard is panned into the window.
import * as React from "react";
import type { TaskMapPlace } from "../../../application/usecases/find-on-task-map";
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
import { createMemoryStore } from "../../components/memory-store";
import { ContextMenu } from "../../components/popup-controls";
import { projectStatusLabel } from "../../components/project-status-label";
import { selectsText } from "../../components/selects-text";
import { TaskCard } from "../../components/task-card";
import type { TaskActions } from "../../hooks/use-task-actions";
import { projectStatusIcons } from "../../project-menu/project-status-icons";
import type { TaskMenuItems, TaskMenuPlace } from "../../task-menu/menu-items";
import { useCanvasInput } from "./canvas-input";
import { type DependencyBadge, dependencyBadges } from "./dependency-badge";
import { DependencyBadgeButton } from "./dependency-popover";
import { EndpointMarker } from "./endpoint-marker";
import { SequentialToggle } from "./sequential-toggle";
import {
  mapAreaDropAttributes,
  mapDropAttributes,
  useMapCardDrag,
} from "./task-map-drag";
import { useTaskMapEdits } from "./task-map-edits";
import { type EndpointMarkers, endpointMarkers } from "./task-map-filter";
import {
  LinkAreaProvider,
  LinkConnector,
  type LinkDrag,
  LinkPreview,
  linkTargetAttributes,
} from "./task-map-links";
import { type Roving, useCardRoving } from "./task-map-roving";
import {
  boxKey,
  type TaskMapBoxKey,
  type TaskMapStores,
} from "./task-map-stores";

/** Every card's width (#213: fixed, the text up to two lines). */
export const cardWidth = 240;
/** A project's and the no-project area's head: its icon and name. */
const areaHeadHeight = 32;
const boxPadding = { top: 8, right: 12, bottom: 12, left: 12 };
const rootId = "root";

const taskKey = (id: TaskId) => boxKey("task", id);

/** The boxes holding a task located (`FindOnTaskMap.locate`), by their keys. */
export function placeBoxKeys(place: TaskMapPlace): TaskMapBoxKey[] {
  return [
    ...(place.project === null ? [] : [boxKey("project", place.project)]),
    ...place.parents.map(taskKey),
  ];
}

export function areaKey(area: TaskMapArea): TaskMapBoxKey {
  return area.kind === "project"
    ? boxKey("project", area.project.id)
    : boxKey("no-project");
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
  isCollapsed(key: TaskMapBoxKey): boolean;
  toggle(key: TaskMapBoxKey): void;
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
  /** In the Tab order (#221); the measuring layer's never are. */
  tabbable: boolean;
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
      tabIndex={props.tabbable ? 0 : -1}
      menuByKeyboard
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
  markers: EndpointMarkers;
  deps: CardDeps;
  look: Look;
  roving: Roving;
  /** Its parent task is sequential (#216: where a drop on it goes). */
  inSequence?: boolean;
}) {
  const { node, layout, badges, markers, deps, look, roving } = props;
  const tabbable = roving(node.task.id);
  const key = taskKey(node.task.id);
  const box = layout.get(key);
  const drag = useMapCardDrag(node.task);
  const onClickCapture = selectOnBlank(node.task.id, look, drag);
  const chosen = look.selected === node.task.id || undefined;
  const drop = mapDropAttributes(node.task, props.inSequence ?? false);
  const badge = badges.get(node.task.id);
  const marked = markers.get(node.task.id);
  const badgeButton = (
    <>
      {badge && <DependencyBadgeButton node={node} badge={badge} />}
      {marked && (
        <>
          <EndpointMarker side="in" endpoints={marked.in} badged={!!badge} />
          <EndpointMarker side="out" endpoints={marked.out} />
        </>
      )}
    </>
  );
  if (node.children.length === 0) {
    return (
      <div
        {...drag}
        {...drop}
        {...linkTargetAttributes(node.task)}
        onClickCapture={onClickCapture}
        className="nextaction-task-map-card"
        data-map-key={key}
        data-next-action={node.nextAction || undefined}
        data-cycle={node.cycle || undefined}
        data-dim={dimAttribute(look, key)}
        data-chosen={chosen}
        style={placeStyle(box)}
      >
        <MapCard node={node} deps={deps} tabbable={tabbable} />
        {badgeButton}
        <LinkConnector task={node.task} />
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
        {...linkTargetAttributes(node.task)}
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
          tabbable={tabbable}
          collapse={{ collapsed, onToggle: () => look.toggle(key) }}
        />
        {badgeButton}
        <LinkConnector task={node.task} />
      </div>
      {!collapsed &&
        node.children.map((child) => (
          <MapNode
            key={child.task.id}
            node={child}
            layout={layout}
            badges={badges}
            markers={markers}
            deps={deps}
            look={look}
            roving={roving}
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

/** Where arrows meet the nodes on the world: level with their cards. */
interface Anchors {
  /** Where an arrow out of the node starts: just right of it. */
  exit(id: TaskId): { x: number; y: number } | null;
  /** Where an arrow into the node ends: just left of it. */
  entry(id: TaskId): { x: number; y: number } | null;
  /** Both tasks are hidden in the same collapsed box: no arrow (#218). */
  joined(from: TaskId, to: TaskId): boolean;
}

/**
 * The anchors on the boxes laid out; a task hidden in a collapsed box
 * (#218) is met on that box (`shownAs`), level with its head.
 */
function anchorsOf(
  boxes: ReadonlyMap<string, LayoutBox>,
  heads: Sizes,
  shownAs: (key: string) => string = (key) => key,
): Anchors {
  const at = (id: TaskId) => {
    const key = shownAs(taskKey(id));
    const box = boxes.get(key);
    if (!box) return null;
    const head = key.startsWith("task:")
      ? heads.get(Number(key.slice(5)))
      : undefined;
    const y = head
      ? box.y + boxPadding.top + head.height / 2
      : box.y + box.height / 2;
    return { box, y };
  };
  return {
    exit(id) {
      const end = at(id);
      return end ? { x: end.box.x + end.box.width + 4, y: end.y } : null;
    },
    entry(id) {
      const end = at(id);
      return end ? { x: end.box.x - 4, y: end.y } : null;
    },
    joined: (from, to) => shownAs(taskKey(from)) === shownAs(taskKey(to)),
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
  /** While a task is selected, the edges of its chain (#218); `null` when not. */
  lit: ReadonlySet<TaskMapEdge> | null;
}) {
  const { lit } = props;
  const dim = (edge: TaskMapEdge) => (lit && !lit.has(edge) ? "" : undefined);
  const prefix = `nextaction-task-map-arrow-${React.useId().replace(/:/g, "")}`;
  const { MenuText } = orca.components;
  const path = (edge: TaskMapEdge) => {
    if (props.anchors.joined(edge.from, edge.to)) return null;
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
            data-dim={dim(edge)}
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
              data-dim={dim(edge)}
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

/** How long the cards take to move to where a new layout puts them. */
const relayoutMs = 240;

/**
 * Every box that collapses on the map: the project boxes and the parent
 * tasks' boxes (#218; the no-project area does not).
 */
export function taskMapBoxKeys(read: TaskMapRead): TaskMapBoxKey[] {
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
  /** The view, a task to center on once laid out, the collapse and selection. */
  stores: TaskMapStores;
  deps: CardDeps;
}) {
  const { read, stores, deps } = props;
  const { view: store, locate } = stores;
  const viewport = React.useRef<HTMLElement | null>(null);
  const world = React.useRef<HTMLDivElement | null>(null);
  const measure = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useMemo(() => allNodes(read), [read]);
  // "Any" and "+N days" where a dependent's arrows come in (#220).
  const badges = React.useMemo(
    () => dependencyBadges(nodes, read.dependencyEdges),
    [nodes, read],
  );
  // Where a dependency's other end is not on the map (#217).
  const markers = React.useMemo(() => endpointMarkers(read.endpoints), [read]);
  const kept = React.useSyncExternalStore(
    stores.collapsed.subscribe,
    stores.collapsed.current,
  );
  // Boxes expanded for now to show a task located (#221).
  const expanded = React.useSyncExternalStore(
    stores.expanded.subscribe,
    stores.expanded.current,
  );
  const collapsed = React.useMemo(() => {
    if (expanded.size === 0) return kept;
    return new Set([...kept].filter((key) => !expanded.has(key)));
  }, [kept, expanded]);
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
      toggle: (key) => {
        // A box expanded for now folds back; its kept state is unchanged.
        const now = stores.expanded.current();
        if (now.has(key) && stores.collapsed.current().has(key)) {
          const next = new Set(now);
          next.delete(key);
          stores.expanded.set(next);
          return;
        }
        stores.collapsed.toggle(key);
      },
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
  const input = useCanvasInput({ viewport, world, store, content });
  const anchors = React.useMemo(
    () => placed && anchorsOf(placed.boxes, placed.heads, placed.shownAs),
    [placed],
  );

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
  // The cards the keyboard moves through (#221).
  const { roving, setKeyed, onCardFocus, onCardKey } = useCardRoving({
    nodes,
    placed,
    viewport,
    bringIntoView: input.bringIntoView,
  });

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
    onPointerDownCapture(event) {
      // The card or box pressed: kept in place if the map is laid out again.
      const { target } = event;
      const key =
        target instanceof Element
          ? target.closest<HTMLElement>("[data-map-key]")?.dataset.mapKey
          : undefined;
      pressed.current = key ?? null;
    },
    onClick(event) {
      // A click on blank canvas clears the task selected (#218); a click in
      // a portal (a menu, a popover) is not on the canvas.
      const { target } = event;
      if (!(target instanceof Element)) return;
      if (!event.currentTarget.contains(target)) return;
      if (
        target.closest(
          ".nextaction-task-map-card, .nextaction-task-map-head, .nextaction-task-map-area-head, .nextaction-task-map-arrow-hit",
        )
      ) {
        return;
      }
      stores.selected.set(null);
    },
    onFocus: onCardFocus,
    onKeyDown(event) {
      if (onCardKey(event)) return;
      if (
        event.key === "Escape" &&
        stores.selected.current() !== null &&
        event.currentTarget.contains(event.target as Node)
      ) {
        stores.selected.set(null);
      }
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

  // An endpoint marker's other end, centered once the map shows it.
  const located = React.useSyncExternalStore(locate.subscribe, locate.current);
  const { centerOn } = input;
  // The map laid out when it was asked for: one read later it should show.
  const askedOn = React.useRef<typeof placed>(null);
  React.useLayoutEffect(() => {
    if (located === null) {
      askedOn.current = null;
      return;
    }
    if (!placed) return;
    const box = placed.boxes.get(placed.shownAs(taskKey(located)));
    if (!box) {
      // Still not shown after the read that should show it: given up.
      if (askedOn.current === null) askedOn.current = placed;
      else if (askedOn.current !== placed) locate.set(null);
      return;
    }
    const head = placed.heads.get(located);
    centerOn({
      x: box.x + box.width / 2,
      y: head
        ? box.y + boxPadding.top + head.height / 2
        : box.y + box.height / 2,
    });
    // The keyboard goes on from it (#221).
    if (placed.shownAs(taskKey(located)) === taskKey(located)) {
      setKeyed(located);
    }
    locate.set(null);
  }, [located, placed, centerOn, locate, setKeyed]);

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
              <MapCard node={node} deps={deps} tabbable={false} />
            </div>
          ))}
        </div>
      )}
      <LinkAreaProvider value={linkArea}>
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
                  {...mapAreaDropAttributes(
                    area.kind === "project"
                      ? { kind: "project", project: area.project.id }
                      : { kind: "noProject" },
                  )}
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
                        markers={markers}
                        deps={deps}
                        look={look}
                        roving={roving}
                      />
                    ))}
                </section>
              );
            })}
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
              lit={litEdges}
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
