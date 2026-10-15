// The all tasks view (GLOSSARY: 全部任务视图, #65): every task not done as a
// tree by block hierarchy, done tasks kept faded where they sit, and the
// tasks held back by a dependency, a sequential parent or a cycle marked
// blocked; below it the done section (GLOSSARY: 已完成区, #66), collapsed by
// default. After the inbox in the navigation, with no count there. It reads
// when the plugin panel opens and again on every task change signal (ADR
// 0007). Nodes with children collapse (#67). The filter panel and the search
// box narrow the tree to what matches, its ancestor tasks showing where it
// sits (#69). A card dragged onto another becomes its subtask (#70), into a
// gap goes there (#71). Every card, the done section's too, dragged onto a
// block in a note panel links the task there (#127). A project shows as a
// project row, collapsed by default, the tasks under its block below it
// (#147). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { LinkTaskInNote } from "../../../application/usecases/link-task-in-note";
import type { MoveTask } from "../../../application/usecases/move-task";
import type {
  AllTasksNode,
  AllTasksRead,
  DoneSection,
  ProjectNode,
  ReadAllTasks,
  TaskNode,
} from "../../../application/usecases/read-all-tasks";
import type { ReadCandidates } from "../../../application/usecases/read-candidates";
import type { CalendarDate, Task, TaskId } from "../../../domain/task/task";
import type { ChangeSignalSource } from "../../../shared/change-signal";
import { t } from "../../../shared/l10n/l10n";
import { TaskListPlaceholder } from "../../components/loading-placeholder";
import { TaskCard } from "../../components/task-card";
import { ViewHeader } from "../../components/view-header";
import {
  FailedNotice,
  PausedNotice,
  ViewNotice,
} from "../../components/view-notice";
import { CardDragArea, useCardDrag } from "../../drag/card-drag";
import { useCandidates } from "../../hooks/use-candidates";
import { useLinkTaskInNote } from "../../hooks/use-link-task-in-note";
import { useMoveTask } from "../../hooks/use-move-task";
import {
  type TaskActions,
  type TaskActionsDeps,
  useTaskActions,
} from "../../hooks/use-task-actions";
import {
  createViewQuery,
  useViewQuery,
  type ViewQuery,
} from "../../hooks/use-view-query";
import { usePanel } from "../../panel/panel-context";
import type { PanelView } from "../../panel/panel-views";
import type { ProjectMenuItems } from "../../project-menu/menu-items";
import type { TaskMenuItems, TaskMenuPlace } from "../../task-menu/menu-items";
import {
  type AllTasksCollapseStore,
  type CollapseKey,
  collapseKey,
  isCollapsed,
} from "./all-tasks-collapse-store";
import {
  AllTasksFilterButton,
  AllTasksSearchBox,
} from "./all-tasks-filter-button";
import {
  type AllTasksFilterStore,
  isFilteringAllTasks,
} from "./all-tasks-filter-store";
import { AllTasksSortSelect } from "./all-tasks-sort-select";
import type { AllTasksSortStore } from "./all-tasks-sort-store";
import type { DoneSectionStore } from "./done-section-store";
import { ProjectRow } from "./project-row";
import { TaskDragArea, TaskDropGap, TaskDropTarget } from "./task-drag";

export interface AllTasksViewDeps {
  readAllTasks: ReadAllTasks;
  /** The current logical day, for dates and overdue. */
  today: () => CalendarDate;
  /** Tasks may have changed: the tree is read again. */
  changes: ChangeSignalSource;
  /** The cards' status menu and "open in notes". */
  taskActions: TaskActionsDeps;
  /** The task menu's registrations, for a right-click on a card. */
  menuItems: () => TaskMenuItems | undefined;
  /**
   * The project menu's registrations (#144), for the project rows' status
   * icon and right-click (#147).
   */
  projectMenuItems: () => ProjectMenuItems | undefined;
  /** The collapsed nodes, kept in the plugin instance's memory (#67). */
  collapse: AllTasksCollapseStore;
  /** The sort, kept in the plugin instance's memory (#68). */
  sort: AllTasksSortStore;
  /** The done section's state, kept in the plugin instance's memory (#66). */
  doneSection: DoneSectionStore;
  /** The filter's contexts and labels to offer: the task panel's (#69). */
  readCandidates: ReadCandidates;
  /**
   * The filter and search text, kept in the plugin instance's memory apart
   * from the next action view's (#69).
   */
  filter: AllTasksFilterStore;
  /** Dragging a card onto another (#70) or into a gap (#71). */
  moveTask: MoveTask;
  /** A card dropped on a block in a note panel links the task there (#127). */
  linkTaskInNote: LinkTaskInNote;
}

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
function shownNodes(
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

/** The nodes of the tree that have children: what "collapse all" collapses. */
function parentKeys(nodes: readonly AllTasksNode[]): CollapseKey[] {
  return nodes.flatMap((node) =>
    node.children.length > 0
      ? [collapseKey(node), ...parentKeys(node.children)]
      : [],
  );
}

/** What every card in the tree shares. */
interface TreeCards {
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

function TreeNodes(props: {
  nodes: readonly AllTasksNode[];
  cards: TreeCards;
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
  cards: TreeCards;
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
function ProjectTreeItem(props: { node: ProjectNode; cards: TreeCards }) {
  const { node, cards } = props;
  const key = collapseKey(node);
  const parent = node.children.length > 0;
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
      {parent && !collapsed && (
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
 * the current range. Collapsed, it renders none of them.
 */
function DoneSectionPart(props: {
  done: DoneSection;
  cards: TreeCards;
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

function AllTasksContent(props: {
  query: ViewQuery<AllTasksRead>;
  today: CalendarDate;
  deps: AllTasksViewDeps;
  /** A filter or search is set: an empty tree says so and offers to clear it. */
  filtered: boolean;
}) {
  const { query, today, deps, filtered } = props;
  const state = useViewQuery(query);
  const actions = useTaskActions(deps.taskActions);
  const moveTask = useMoveTask(deps.moveTask, deps.taskActions.notify);
  const linkTaskInNote = useLinkTaskInNote(
    deps.linkTaskInNote,
    deps.taskActions.notify,
  );
  const menuItems = deps.menuItems();
  const { selectedTaskId, selectTask } = usePanel();
  const menuPlace = React.useMemo(() => ({ selectTask }), [selectTask]);
  const collapsed = React.useSyncExternalStore(
    deps.collapse.subscribe,
    deps.collapse.current,
  );
  const { sort } = React.useSyncExternalStore(
    deps.sort.subscribe,
    deps.sort.current,
  );

  if (state.kind === "loading") return <TaskListPlaceholder />;
  if (state.kind === "paused") return <PausedNotice />;
  if (state.kind === "failed") {
    return (
      <FailedNotice
        error={state.error}
        message={(reason) =>
          t("Could not read all tasks: ${reason}", { reason })
        }
        onRetry={() => query.reset()}
      />
    );
  }
  const nodes = shownNodes(state.data.tree, selectedTaskId);
  const done = state.data.done;
  const cards: TreeCards = {
    today,
    actions,
    menuItems,
    menuPlace,
    projectMenuItems: deps.projectMenuItems(),
    selectedTaskId,
    selectTask,
    collapsed,
    toggleCollapsed: deps.collapse.toggle,
    topLevelGaps: sort === "note",
  };
  if (filtered && nodes.length === 0 && done.count === 0) {
    const { Button } = orca.components;
    return (
      <>
        <ViewNotice
          icon="ti ti-filter-off"
          title={t("No tasks match the filter")}
          action={
            <Button variant="outline" onClick={deps.filter.clear}>
              {t("Clear filter")}
            </Button>
          }
        />
        <CardDragArea onNoteDrop={linkTaskInNote}>
          <DoneSectionPart done={done} cards={cards} store={deps.doneSection} />
        </CardDragArea>
      </>
    );
  }
  if (nodes.length === 0 && done.count === 0 && !done.hasEarlier) {
    return (
      <ViewNotice
        icon="ti ti-list-tree"
        title={t("No tasks yet")}
        detail={t(
          "Tasks not done show here as a tree, as they sit in the notes.",
        )}
      />
    );
  }
  return (
    <TaskDragArea onMove={moveTask} onNoteDrop={linkTaskInNote}>
      {nodes.length > 0 && <TreeNodes top nodes={nodes} cards={cards} />}
      <DoneSectionPart done={done} cards={cards} store={deps.doneSection} />
    </TaskDragArea>
  );
}

/**
 * One button for "collapse all" and "expand all", once the tree has a node
 * to collapse: while any of them is expanded it collapses them all,
 * otherwise it expands them all.
 */
function CollapseAllButton(props: {
  query: ViewQuery<AllTasksRead>;
  selectedTaskId: TaskId | undefined;
  collapse: AllTasksCollapseStore;
}) {
  const { Button, Tooltip } = orca.components;
  const state = useViewQuery(props.query);
  const collapsed = React.useSyncExternalStore(
    props.collapse.subscribe,
    props.collapse.current,
  );
  if (state.kind !== "loaded") return null;
  const keys = parentKeys(shownNodes(state.data.tree, props.selectedTaskId));
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

/**
 * The all tasks view. Its query starts when the view shows and stops when it
 * goes, so every opening starts from what the notes hold then.
 */
export function createAllTasksView(deps: AllTasksViewDeps): PanelView {
  /**
   * The selected task, kept by every read while it is selected. One value
   * serves the whole view: there is at most one plugin panel.
   */
  let selected: TaskId | undefined;
  const query = createViewQuery(
    () =>
      deps.readAllTasks({
        keep: selected,
        sort: deps.sort.current().sort,
        direction: deps.sort.current().direction,
        showEarlierDone: deps.doneSection.current().showEarlier,
        filter: deps.filter.current().filter,
        search: deps.filter.current().search,
      }),
    deps.changes,
  );
  // A new sort, filter or search text reads again; all live as long as the
  // plugin instance.
  deps.sort.subscribe(() => query.reload());
  deps.filter.subscribe(() => query.reload());
  // Showing earlier items reads again; expanding only renders what is read.
  // Both live as long as the plugin instance.
  let showEarlier = deps.doneSection.current().showEarlier;
  deps.doneSection.subscribe(() => {
    const next = deps.doneSection.current().showEarlier;
    if (next === showEarlier) return;
    showEarlier = next;
    query.reload();
  });

  function AllTasksView() {
    const { selectedTaskId } = usePanel();
    const sort = React.useSyncExternalStore(
      deps.sort.subscribe,
      deps.sort.current,
    );
    const filter = React.useSyncExternalStore(
      deps.filter.subscribe,
      deps.filter.current,
    );
    const filtering = isFilteringAllTasks(filter);
    const candidates = useCandidates(
      deps.readCandidates,
      deps.changes,
      deps.taskActions.notify,
    );
    const state = useViewQuery(query);
    // Filtering, the header counts the tasks that match; otherwise nothing:
    // the number of all tasks would only weigh on the user (#63).
    const count =
      filtering && state.kind === "loaded" ? state.data.matchCount : undefined;
    // The selection the latest read kept. The read the query starts with
    // keeps none: the effect subscribing to it runs before this one.
    const readFor = React.useRef<TaskId | undefined>(undefined);
    // Before any read the selection may cause: effects run before the
    // change signal's debounced read. A new selection reads again, so a task
    // kept for the earlier one shows in the done section, and counts there,
    // at once; until that read ends, `shownNodes` leaves it out of the tree.
    React.useEffect(() => {
      selected = selectedTaskId;
      if (readFor.current !== selectedTaskId) {
        readFor.current = selectedTaskId;
        query.reload();
      }
      return () => {
        selected = undefined;
      };
    }, [selectedTaskId]);
    return (
      <>
        <ViewHeader
          title={t("All tasks")}
          count={count}
          // As in the next action view: the count, only while filtering or
          // searching, shows in every tier.
          countInEveryTier={filtering}
        />
        {/* One row: the search box, then the controls of how the tree
            shows (sort, direction, collapse or expand all) and the filter
            button, whose panel opens over the tree. */}
        <div className="nextaction-toolbar">
          <AllTasksSearchBox
            search={filter.search}
            onChange={(search) => deps.filter.set({ ...filter, search })}
          />
          <div className="nextaction-toolbar-view">
            <AllTasksSortSelect state={sort} onChange={deps.sort.set} />
            <CollapseAllButton
              query={query}
              selectedTaskId={selectedTaskId}
              collapse={deps.collapse}
            />
            <AllTasksFilterButton
              state={filter}
              candidates={candidates}
              onChange={deps.filter.set}
            />
          </div>
        </div>
        <AllTasksContent
          query={query}
          today={deps.today()}
          deps={deps}
          filtered={filtering}
        />
      </>
    );
  }

  return {
    id: "all-tasks",
    // After the inbox (10). No count in the navigation: the number of all
    // tasks would only weigh on the user (#63).
    order: 20,
    icon: "ti ti-list-tree",
    label: () => t("All tasks"),
    component: AllTasksView,
  };
}
