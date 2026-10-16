// The task tree as the all tasks view shows it (GLOSSARY: 全部任务视图,
// #65), apart from any one view's query and stores so another view can show
// a read of its own the same way (#154): the tree by block hierarchy, done
// tasks kept faded where they sit, project rows collapsed by default (#147);
// the done section below it (GLOSSARY: 已完成区, #66); and the "collapse all"
// button (#67). What is read, the collapse and done section state and every
// action come from the caller. A card dragged onto another becomes its
// subtask (#70), into a gap goes there (#71); the caller's `TaskDragArea`
// handles both, and a drop in a note panel (#127). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  AllTasksNode,
  DoneSection,
  ProjectNode,
  TaskNode,
} from "../../../application/usecases/read-all-tasks";
import type { CalendarDate, Task, TaskId } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { TaskCard } from "../../components/task-card";
import { useCardDrag } from "../../drag/card-drag";
import type { TaskActions } from "../../hooks/use-task-actions";
import type { ProjectMenuItems } from "../../project-menu/menu-items";
import type { TaskMenuItems, TaskMenuPlace } from "../../task-menu/menu-items";
import {
  type AllTasksCollapseStore,
  type CollapseKey,
  collapseKey,
  isCollapsed,
} from "./all-tasks-collapse-store";
import type { DoneSectionStore } from "./done-section-store";
import { ProjectRow } from "./project-row";
import { TaskDropGap, TaskDropTarget } from "./task-drag";

/** The node or a node below it is a task not done. */
function holdsOpenTask(node: AllTasksNode): boolean {
  switch (node.kind) {
    case "task":
      return node.task.status !== "done" || node.children.some(holdsOpenTask);
    case "project":
      return node.children.some(holdsOpenTask);
  }
}

/** The node was kept for a selection other than `selected`. */
function keptBefore(node: AllTasksNode, selected: TaskId | undefined): boolean {
  switch (node.kind) {
    case "task":
      return node.faded === "kept" && node.task.id !== selected;
    case "project":
      return false;
  }
}

/**
 * What the tree shows of a read: a task kept for an earlier selection is no
 * longer shown once the selection moves on (only for where matching tasks
 * below it sit, if any), and neither are the ancestor tasks that only showed
 * above it. A project row always stays: it is shown for itself.
 */
export function shownNodes(
  nodes: readonly AllTasksNode[],
  selected: TaskId | undefined,
): AllTasksNode[] {
  const shown: AllTasksNode[] = [];
  for (const node of nodes) {
    const children = shownNodes(node.children, selected);
    if (node.kind === "project") {
      shown.push({ ...node, children });
      continue;
    }
    if (keptBefore(node, selected)) {
      if (children.length > 0)
        shown.push({ ...node, faded: "ancestor", children });
      continue;
    }
    const onlyAboveKept =
      node.children.length > 0 &&
      children.length === 0 &&
      (node.faded === "ancestor" || !holdsOpenTask(node));
    if (onlyAboveKept) continue;
    shown.push({ ...node, children });
  }
  return shown;
}

/**
 * The nodes of the tree that have children: what "collapse all" collapses.
 * `projectsExpanded`: project rows, then temporarily expanded, are left out,
 * so their saved state stays as it is (#148); the tasks below still count.
 */
function parentKeys(
  nodes: readonly AllTasksNode[],
  projectsExpanded: boolean,
): CollapseKey[] {
  return nodes.flatMap((node) => {
    if (node.children.length === 0) return [];
    const below = parentKeys(node.children, projectsExpanded);
    return node.kind === "project" && projectsExpanded
      ? below
      : [collapseKey(node), ...below];
  });
}

/** What every card of the tree and the done section shares. */
export interface TaskTreeCards {
  today: CalendarDate;
  actions: TaskActions;
  menuItems: TaskMenuItems | undefined;
  menuPlace: TaskMenuPlace;
  /** The project menu's registrations, for the project rows. */
  projectMenuItems: ProjectMenuItems | undefined;
  selectedTaskId: TaskId | undefined;
  selectTask: (id: TaskId) => void;
  /** The nodes turned from their default (`isCollapsed`). */
  collapsed: ReadonlySet<CollapseKey>;
  toggleCollapsed: (key: CollapseKey) => void;
  /**
   * Top-level tasks have gaps to drop in: only in note order, where a place
   * among them means something (#63).
   */
  topLevelGaps: boolean;
  /**
   * A filter or search is set: project rows show expanded, without a toggle,
   * and the saved collapse state is left as it is, back once cleared (#148).
   */
  projectsExpanded: boolean;
}

/** A node's collapse button. */
function CollapseButton(props: { collapsed: boolean; onToggle: () => void }) {
  const { Tooltip } = orca.components;
  const label = props.collapsed ? t("Expand") : t("Collapse");
  return (
    <Tooltip text={label}>
      <button
        type="button"
        className="nextaction-task-card-button nextaction-task-tree-toggle"
        aria-expanded={!props.collapsed}
        aria-label={label}
        onClick={props.onToggle}
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

/**
 * The tree of `nodes` (already `shownNodes`), inside the caller's
 * `TaskDragArea`.
 */
export function TaskTree(props: {
  nodes: readonly AllTasksNode[];
  cards: TaskTreeCards;
}) {
  return <TreeNodes top nodes={props.nodes} cards={props.cards} />;
}

function TreeNodes(props: {
  nodes: readonly AllTasksNode[];
  cards: TaskTreeCards;
  /** The top-level list, whose width the cards' container queries follow. */
  top?: boolean;
}) {
  const { cards } = props;
  const gaps = !props.top || cards.topLevelGaps;
  const last = props.nodes.at(-1);
  return (
    <ul
      className={
        props.top
          ? "nextaction-task-list nextaction-task-tree"
          : "nextaction-task-tree-children"
      }
    >
      {props.nodes.map((node) => (
        <TreeItem
          key={collapseKey(node)}
          node={node}
          cards={cards}
          gaps={gaps}
          // The bottom gap: after the last top-level node.
          bottomGap={props.top === true && gaps && node === last}
        />
      ))}
    </ul>
  );
}

/** What a node's list item is given besides its node. */
interface TreeItemProps {
  cards: TaskTreeCards;
  /** Has a gap to drop in above it. */
  gaps: boolean;
  /** Has a gap to drop in below it: the last top-level node. */
  bottomGap: boolean;
}

/** A node's list item, as its kind shows it. */
function TreeItem(props: TreeItemProps & { node: AllTasksNode }) {
  const { node, ...rest } = props;
  switch (node.kind) {
    case "task":
      return <TaskTreeItem node={node} {...rest} />;
    case "project":
      return <ProjectTreeItem node={node} cards={rest.cards} />;
  }
}

/**
 * A project row's list item: the row, and the tasks under its block below
 * it. The row itself is never dragged nor a place to drop (#147); the gaps
 * between its tasks are, so tasks still move into and out of the project
 * block. It has no gap of its own: a gap goes next to a task.
 */
function ProjectTreeItem(props: { node: ProjectNode; cards: TaskTreeCards }) {
  const { node, cards } = props;
  const key = collapseKey(node);
  const expanded = cards.projectsExpanded;
  // Temporarily expanded, it has nothing to toggle.
  const parent = node.children.length > 0 && !expanded;
  const collapsed = parent && isCollapsed(cards.collapsed, key);
  return (
    <li>
      <div className="nextaction-task-tree-row nextaction-project-tree-row">
        {parent ? (
          <CollapseButton
            collapsed={collapsed}
            onToggle={() => cards.toggleCollapsed(key)}
          />
        ) : (
          <span className="nextaction-task-tree-toggle" aria-hidden="true" />
        )}
        <ProjectRow
          node={node}
          today={cards.today}
          menuItems={cards.projectMenuItems}
          onToggle={parent ? () => cards.toggleCollapsed(key) : undefined}
          onOpenInNotes={() => cards.actions.openBlockInNotes(node.project.id)}
        />
      </div>
      {node.children.length > 0 && (expanded || !collapsed) && (
        <TreeNodes nodes={node.children} cards={cards} />
      )}
    </li>
  );
}

/** A task node's list item: its card, and its subtree below it. */
function TaskTreeItem(props: TreeItemProps & { node: TaskNode }) {
  const { node, cards } = props;
  const key = collapseKey(node);
  const parent = node.children.length > 0;
  const collapsed = parent && isCollapsed(cards.collapsed, key);
  return (
    <li>
      {/* Before the card below it; a task the filter hides stays
          where it is (#71). */}
      {props.gaps && <TaskDropGap target={node.task.id} placement="before" />}
      <div className="nextaction-task-tree-row">
        {parent ? (
          <CollapseButton
            collapsed={collapsed}
            onToggle={() => cards.toggleCollapsed(key)}
          />
        ) : (
          // Keeps the cards of a level in line, toggle or not.
          <span className="nextaction-task-tree-toggle" aria-hidden="true" />
        )}
        {/* Only tree cards are dragged and dropped on, never the done
            section's (#70). */}
        <TaskDropTarget task={node.task}>
          <TaskCard
            task={node.task}
            today={cards.today}
            actions={cards.actions}
            menuItems={cards.menuItems}
            menuPlace={cards.menuPlace}
            onOpen={(open) => cards.selectTask(open.id)}
            selected={node.task.id === cards.selectedTaskId}
            // Done or kept: the card's faded "kept" look (#65).
            kept={node.faded !== null}
            // Only faded: a done task's status icon already says why, and a
            // kept one leaves for more reasons than its status.
            keptStatusShown={false}
            blocked={node.blocked}
            project={node.shownProject}
          />
        </TaskDropTarget>
      </div>
      {/* Collapsed, the toggle alone says there is more below. */}
      {parent && !collapsed && (
        <TreeNodes nodes={node.children} cards={cards} />
      )}
      {props.bottomGap && (
        <TaskDropGap target={node.task.id} placement="after" />
      )}
    </li>
  );
}

/**
 * The done section below the tree: its title, a toggle, counts the items of
 * the current range. Collapsed, it renders none of them. Inside the caller's
 * `TaskDragArea` or `CardDragArea`: its cards drag into the notes only.
 */
export function TaskDoneSection(props: {
  done: DoneSection;
  cards: TaskTreeCards;
  /** Expanded or not, earlier items or not; the caller reads again on the latter. */
  store: DoneSectionStore;
}) {
  const { done, cards, store } = props;
  const state = React.useSyncExternalStore(store.subscribe, store.current);
  // Nothing done at all: no section.
  if (done.count === 0 && !done.hasEarlier) return null;
  return (
    <section className="nextaction-done-section">
      <button
        type="button"
        className="nextaction-done-section-toggle"
        aria-expanded={state.expanded}
        onClick={() => store.set({ ...state, expanded: !state.expanded })}
      >
        <i
          className={
            state.expanded ? "ti ti-chevron-down" : "ti ti-chevron-right"
          }
          aria-hidden="true"
        />
        {t("Done · ${count}", { count: String(done.count) })}
      </button>
      {state.expanded && (
        <>
          {done.items.length > 0 && (
            <ul className="nextaction-task-list">
              {done.items.map((item) =>
                item.kind === "task" ? (
                  <DoneItem key={`task:${item.task.id}`} task={item.task}>
                    <TaskCard
                      task={item.task}
                      today={cards.today}
                      actions={cards.actions}
                      menuItems={cards.menuItems}
                      menuPlace={cards.menuPlace}
                      onOpen={(open) => cards.selectTask(open.id)}
                      selected={item.task.id === cards.selectedTaskId}
                      project={item.shownProject}
                    />
                  </DoneItem>
                ) : (
                  // One item for the project and its tasks; not dragged.
                  <li key={`project:${item.project.id}`}>
                    <ProjectRow
                      node={item}
                      today={cards.today}
                      menuItems={cards.projectMenuItems}
                      onOpenInNotes={() =>
                        cards.actions.openBlockInNotes(item.project.id)
                      }
                      inDone
                    />
                  </li>
                ),
              )}
            </ul>
          )}
          {done.hasEarlier && (
            <button
              type="button"
              className="nextaction-done-section-earlier"
              onClick={() => store.set({ ...state, showEarlier: true })}
            >
              {t("Show earlier")}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * A done card's list item: dragged by a press anywhere on it into the notes
 * only, never moved in the plugin panel nor a place to move to (#70, #127).
 */
function DoneItem(props: { task: Task; children: React.ReactNode }) {
  return <li {...useCardDrag(props.task)}>{props.children}</li>;
}

/**
 * One button for "collapse all" and "expand all", once the tree has a node
 * to collapse: while any of them is expanded it collapses them all,
 * otherwise it expands them all.
 */
export function CollapseAllButton(props: {
  /** The tree as shown (`shownNodes`); absent before a read: no button. */
  nodes: readonly AllTasksNode[] | undefined;
  collapse: AllTasksCollapseStore;
  /** A filter or search is set: project rows are temporarily expanded. */
  projectsExpanded: boolean;
}) {
  const { Button, Tooltip } = orca.components;
  const collapsed = React.useSyncExternalStore(
    props.collapse.subscribe,
    props.collapse.current,
  );
  if (props.nodes === undefined) return null;
  const keys = parentKeys(props.nodes, props.projectsExpanded);
  if (keys.length === 0) return null;
  // Records of nodes no longer in the tree count for nothing.
  const anyExpanded = keys.some((key) => !isCollapsed(collapsed, key));
  const label = anyExpanded ? t("Collapse all") : t("Expand all");
  return (
    <Tooltip text={label}>
      <Button
        variant="plain"
        className="nextaction-toolbar-button"
        aria-label={label}
        onClick={() =>
          anyExpanded
            ? props.collapse.collapse(keys)
            : props.collapse.expand(keys)
        }
      >
        <i
          className={anyExpanded ? "ti ti-fold" : "ti ti-fold-down"}
          aria-hidden="true"
        />
      </Button>
    </Tooltip>
  );
}
