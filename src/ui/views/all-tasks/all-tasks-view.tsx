// The all tasks view (GLOSSARY: 全部任务视图, #65): every task not done as a
// tree by block hierarchy, done tasks kept faded where they sit, and the
// tasks held back by a dependency, a sequential parent or a cycle marked
// blocked; below it the done section (GLOSSARY: 已完成区, #66), collapsed by
// default. After the inbox in the navigation, with no count there. It reads
// when the plugin panel opens and again on every task change signal (ADR
// 0007). Nodes with children collapse (#67). The filter bar and the search
// box narrow the tree to what matches, its ancestor tasks showing where it
// sits (#69). A card dragged onto another becomes its subtask (#70), into a
// gap goes there (#71). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { MoveTask } from "../../../application/usecases/move-task";
import type {
  AllTasksNode,
  AllTasksRead,
  DoneSection,
  ReadAllTasks,
} from "../../../application/usecases/read-all-tasks";
import type { ReadCandidates } from "../../../application/usecases/read-candidates";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
import type { ChangeSignalSource } from "../../../shared/change-signal";
import { t } from "../../../shared/l10n/l10n";
import { TaskCard } from "../../components/task-card";
import { ViewHeader } from "../../components/view-header";
import {
  FailedNotice,
  PausedNotice,
  ViewNotice,
} from "../../components/view-notice";
import { useCandidates } from "../../hooks/use-candidates";
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
import type { TaskMenuItems, TaskMenuPlace } from "../../task-menu/menu-items";
import type { AllTasksCollapseStore } from "./all-tasks-collapse-store";
import { AllTasksFilterBar, AllTasksSearchBox } from "./all-tasks-filter-bar";
import {
  type AllTasksFilterStore,
  isFilteringAllTasks,
} from "./all-tasks-filter-store";
import { AllTasksSortSelect } from "./all-tasks-sort-select";
import type { AllTasksSortStore } from "./all-tasks-sort-store";
import type { DoneSectionStore } from "./done-section-store";
import {
  TaskDragArea,
  TaskDragHandle,
  TaskDropGap,
  TaskDropTarget,
} from "./task-drag";

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
}

/** The node or a node below it is a task not done. */
function holdsOpenTask(node: AllTasksNode): boolean {
  return node.task.status !== "done" || node.children.some(holdsOpenTask);
}

/**
 * What the tree shows of a read: a task kept for an earlier selection is no
 * longer shown once the selection moves on (only for where matching tasks
 * below it sit, if any), and neither are the ancestor tasks that only showed
 * above it.
 */
function shownNodes(
  nodes: readonly AllTasksNode[],
  selected: TaskId | undefined,
): AllTasksNode[] {
  const shown: AllTasksNode[] = [];
  for (const node of nodes) {
    const children = shownNodes(node.children, selected);
    const keptBefore = node.faded === "kept" && node.task.id !== selected;
    if (keptBefore) {
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

/** How many tasks sit below the node in the tree: what collapsing it hides. */
function descendantCount(node: AllTasksNode): number {
  return node.children.reduce(
    (count, child) => count + 1 + descendantCount(child),
    0,
  );
}

/** The tasks of the tree that have children: what "collapse all" collapses. */
function parentIds(nodes: readonly AllTasksNode[]): TaskId[] {
  return nodes.flatMap((node) =>
    node.children.length > 0 ? [node.task.id, ...parentIds(node.children)] : [],
  );
}

function Placeholder() {
  const { Skeleton } = orca.components;
  return (
    <div
      className="nextaction-task-list"
      role="status"
      aria-label={t("Loading tasks")}
    >
      {[0, 1, 2].map((key) => (
        <div key={key} className="nextaction-task-card-placeholder">
          <Skeleton />
        </div>
      ))}
    </div>
  );
}

/** What every card in the tree shares. */
interface TreeCards {
  today: CalendarDate;
  actions: TaskActions;
  menuItems: TaskMenuItems | undefined;
  menuPlace: TaskMenuPlace;
  selectedTaskId: TaskId | undefined;
  selectTask: (id: TaskId) => void;
  collapsed: ReadonlySet<TaskId>;
  toggleCollapsed: (id: TaskId) => void;
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
      {props.nodes.map((node) => {
        const parent = node.children.length > 0;
        const collapsed = parent && cards.collapsed.has(node.task.id);
        return (
          <li key={node.task.id}>
            {/* Before the card below it; a task the filter hides stays
                where it is (#71). */}
            {gaps && <TaskDropGap target={node.task.id} placement="before" />}
            <div className="nextaction-task-tree-row">
              {parent ? (
                <CollapseButton
                  collapsed={collapsed}
                  onToggle={() => cards.toggleCollapsed(node.task.id)}
                />
              ) : (
                // Keeps the cards of a level in line, toggle or not.
                <span
                  className="nextaction-task-tree-toggle"
                  aria-hidden="true"
                />
              )}
              {/* Only tree cards are dragged and dropped on, never the done
                  section's (#70). */}
              <TaskDropTarget id={node.task.id}>
                <TaskDragHandle task={node.task} />
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
                />
              </TaskDropTarget>
            </div>
            {collapsed ? (
              <div className="nextaction-task-tree-hidden">
                {t("Hidden tasks: ${count}", {
                  count: String(descendantCount(node)),
                })}
              </div>
            ) : (
              parent && <TreeNodes nodes={node.children} cards={cards} />
            )}
            {/* The bottom gap: after the last top-level task. */}
            {props.top && gaps && node === last && (
              <TaskDropGap target={node.task.id} placement="after" />
            )}
          </li>
        );
      })}
    </ul>
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
              {done.items.map((task) => (
                <li key={task.id}>
                  <TaskCard
                    task={task}
                    today={cards.today}
                    actions={cards.actions}
                    menuItems={cards.menuItems}
                    menuPlace={cards.menuPlace}
                    onOpen={(open) => cards.selectTask(open.id)}
                    selected={task.id === cards.selectedTaskId}
                  />
                </li>
              ))}
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
  const menuItems = deps.menuItems();
  const { selectedTaskId, selectTask } = usePanel();
  const menuPlace = React.useMemo(() => ({ selectTask }), [selectTask]);
  const collapsed = React.useSyncExternalStore(
    deps.collapse.subscribe,
    deps.collapse.current,
  );
  const sort = React.useSyncExternalStore(
    deps.sort.subscribe,
    deps.sort.current,
  );

  if (state.kind === "loading") return <Placeholder />;
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
        <DoneSectionPart done={done} cards={cards} store={deps.doneSection} />
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
    <TaskDragArea onMove={moveTask}>
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
  const ids = parentIds(shownNodes(state.data.tree, props.selectedTaskId));
  if (ids.length === 0) return null;
  // Records of tasks no longer in the tree count for nothing.
  const anyExpanded = ids.some((id) => !collapsed.has(id));
  const label = anyExpanded ? t("Collapse all") : t("Expand all");
  return (
    <Tooltip text={label}>
      <Button
        variant="plain"
        className="nextaction-toolbar-button"
        aria-label={label}
        onClick={() =>
          anyExpanded ? props.collapse.collapse(ids) : props.collapse.clear()
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
        sort: deps.sort.current(),
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
        {/* Two rows: the sort, collapse or expand all and the search; then
            the filter fields. */}
        <div className="nextaction-toolbar">
          <div className="nextaction-toolbar-row">
            <AllTasksSortSelect sort={sort} onChange={deps.sort.set} />
            <CollapseAllButton
              query={query}
              selectedTaskId={selectedTaskId}
              collapse={deps.collapse}
            />
            <AllTasksSearchBox
              search={filter.search}
              onChange={(search) => deps.filter.set({ ...filter, search })}
            />
          </div>
          <AllTasksFilterBar
            state={filter}
            candidates={candidates}
            onChange={deps.filter.set}
          />
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
