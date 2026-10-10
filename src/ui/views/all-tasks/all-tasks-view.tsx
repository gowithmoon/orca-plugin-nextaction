// The all tasks view (GLOSSARY: 全部任务视图, #65): every task not done as a
// tree by block hierarchy, done tasks kept faded where they sit, and the
// tasks held back by a dependency, a sequential parent or a cycle marked
// blocked. After the inbox in the navigation, with no count there. It reads
// when the plugin panel opens and again on every task change signal (ADR
// 0007). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  AllTasksNode,
  AllTasksRead,
  ReadAllTasks,
} from "../../../application/usecases/read-all-tasks";
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
}

/** The node or a node below it is a task not done. */
function holdsOpenTask(node: AllTasksNode): boolean {
  return node.task.status !== "done" || node.children.some(holdsOpenTask);
}

/**
 * What the tree shows of a read: a task kept for an earlier selection is no
 * longer shown once the selection moves on, and neither are the done
 * ancestor tasks that only showed above it.
 */
function shownNodes(
  nodes: readonly AllTasksNode[],
  selected: TaskId | undefined,
): AllTasksNode[] {
  const shown: AllTasksNode[] = [];
  for (const node of nodes) {
    if (node.faded === "kept" && node.task.id !== selected) continue;
    const children = shownNodes(node.children, selected);
    const onlyAboveKept =
      node.children.length > 0 && children.length === 0 && !holdsOpenTask(node);
    if (onlyAboveKept) continue;
    shown.push({ ...node, children });
  }
  return shown;
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
}

function TreeNodes(props: {
  nodes: readonly AllTasksNode[];
  cards: TreeCards;
  /** The top-level list, whose width the cards' container queries follow. */
  top?: boolean;
}) {
  const { cards } = props;
  return (
    <ul
      className={
        props.top
          ? "nextaction-task-list nextaction-task-tree"
          : "nextaction-task-tree-children"
      }
    >
      {props.nodes.map((node) => (
        <li key={node.task.id}>
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
          {node.children.length > 0 && (
            <TreeNodes nodes={node.children} cards={cards} />
          )}
        </li>
      ))}
    </ul>
  );
}

function AllTasksContent(props: {
  query: ViewQuery<AllTasksRead>;
  today: CalendarDate;
  deps: AllTasksViewDeps;
}) {
  const { query, today, deps } = props;
  const state = useViewQuery(query);
  const actions = useTaskActions(deps.taskActions);
  const menuItems = deps.menuItems();
  const { selectedTaskId, selectTask } = usePanel();
  const menuPlace = React.useMemo(() => ({ selectTask }), [selectTask]);

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
  if (nodes.length === 0) {
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
    <TreeNodes
      top
      nodes={nodes}
      cards={{
        today,
        actions,
        menuItems,
        menuPlace,
        selectedTaskId,
        selectTask,
      }}
    />
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
    () => deps.readAllTasks({ keep: selected }),
    deps.changes,
  );

  function AllTasksView() {
    const { selectedTaskId } = usePanel();
    // Before any read the selection may cause: effects run before the
    // change signal's debounced read.
    React.useEffect(() => {
      selected = selectedTaskId;
      return () => {
        selected = undefined;
      };
    }, [selectedTaskId]);
    return (
      <>
        <ViewHeader title={t("All tasks")} />
        <AllTasksContent query={query} today={deps.today()} deps={deps} />
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
