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
// (#147). The tree, the done section and "collapse all" are the shared ones
// of `task-tree.tsx` (#154); this view wires its own query and stores to
// them. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { LinkTaskInNote } from "../../../application/usecases/link-task-in-note";
import type { MoveTask } from "../../../application/usecases/move-task";
import type {
  AllTasksRead,
  ReadAllTasks,
} from "../../../application/usecases/read-all-tasks";
import type { ReadCandidates } from "../../../application/usecases/read-candidates";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
import type { ChangeSignalSource } from "../../../shared/change-signal";
import { t } from "../../../shared/l10n/l10n";
import { TaskListPlaceholder } from "../../components/loading-placeholder";
import { ViewHeader } from "../../components/view-header";
import {
  FailedNotice,
  PausedNotice,
  ViewNotice,
} from "../../components/view-notice";
import { CardDragArea } from "../../drag/card-drag";
import { useCandidates } from "../../hooks/use-candidates";
import { useLinkTaskInNote } from "../../hooks/use-link-task-in-note";
import { useMoveTask } from "../../hooks/use-move-task";
import {
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
import type { TaskMenuItems } from "../../task-menu/menu-items";
import type { AllTasksCollapseStore } from "./all-tasks-collapse-store";
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
import { TaskDragArea } from "./task-drag";
import {
  CollapseAllButton,
  shownNodes,
  TaskDoneSection,
  TaskTree,
  type TaskTreeCards,
} from "./task-tree";

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
  const cards: TaskTreeCards = {
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
    projectsExpanded: filtered,
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
          <TaskDoneSection done={done} cards={cards} store={deps.doneSection} />
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
      {nodes.length > 0 && <TaskTree nodes={nodes} cards={cards} />}
      <TaskDoneSection done={done} cards={cards} store={deps.doneSection} />
    </TaskDragArea>
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
              nodes={
                state.kind === "loaded"
                  ? shownNodes(state.data.tree, selectedTaskId)
                  : undefined
              }
              collapse={deps.collapse}
              projectsExpanded={filtering}
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
