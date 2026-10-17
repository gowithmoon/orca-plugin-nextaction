// The projects view (GLOSSARY: 项目视图, #155): the project list, every
// project grouped by project status, each as the project row of the all
// tasks view (GLOSSARY: 项目行). Groups collapse, the done group by default.
// After the all tasks view in the navigation, with no count there. A click
// on the rest of a row opens its project details (#156); "‹ Projects" or the
// navigation item clicked again goes back to the list. The project open
// stays across views, in the plugin instance's memory; one no longer there
// (dropped, its project tag removed, or the tag paused) goes back to the
// list. Each part reads when it shows and again on every task change signal
// (ADR 0007). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { LinkTaskInNote } from "../../../application/usecases/link-task-in-note";
import type { MoveTask } from "../../../application/usecases/move-task";
import type {
  ProjectScopeRead,
  ReadAllTasks,
} from "../../../application/usecases/read-all-tasks";
import type { ReadCandidates } from "../../../application/usecases/read-candidates";
import type { ReadMoveCrossing } from "../../../application/usecases/read-move-crossing";
import type {
  ProjectBoardRead,
  ReadProjectBoard,
} from "../../../application/usecases/read-project-board";
import type {
  ProjectGanttRead,
  ReadProjectGantt,
} from "../../../application/usecases/read-project-gantt";
import type {
  ProjectGroup,
  ProjectListRead,
  ReadProjectList,
} from "../../../application/usecases/read-project-list";
import type { ProjectId } from "../../../domain/project/project";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
import type { ChangeSignalSource } from "../../../shared/change-signal";
import { t } from "../../../shared/l10n/l10n";
import type { OpenQuickCapture } from "../../capture/quick-capture-popup";
import { TaskListPlaceholder } from "../../components/loading-placeholder";
import { projectStatusLabel } from "../../components/project-status-label";
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
  type TaskActions,
  type TaskActionsDeps,
  useTaskActions,
} from "../../hooks/use-task-actions";
import {
  createViewQuery,
  useViewQuery,
  type ViewQuery,
} from "../../hooks/use-view-query";
import { usePanel, useWithoutSidePane } from "../../panel/panel-context";
import type { PanelView } from "../../panel/panel-views";
import type { ProjectMenuItems } from "../../project-menu/menu-items";
import type { TaskMenuItems } from "../../task-menu/menu-items";
import {
  AllTasksFilterButton,
  AllTasksSearchBox,
} from "../all-tasks/all-tasks-filter-button";
import { isFilteringAllTasks } from "../all-tasks/all-tasks-filter-store";
import { AllTasksSortSelect } from "../all-tasks/all-tasks-sort-select";
import { ProjectRow } from "../all-tasks/project-row";
import { TaskDragArea } from "../all-tasks/task-drag";
import {
  CollapseAllButton,
  shownNodes,
  TaskDoneSection,
  TaskTree,
  type TaskTreeCards,
} from "../all-tasks/task-tree";
import type { TaskTreeStores } from "../all-tasks/task-tree-stores";
import { useMoveConfirmation } from "./move-confirmation";
import type { OpenProjectStore } from "./open-project-store";
import { BoardCollapseAllButton, ProjectBoardColumns } from "./project-board";
import type {
  BoardGroupingStore,
  ProjectBoardStores,
} from "./project-board-stores";
import { BackToProjects, ProjectAttributes } from "./project-details";
import { GanttCollapseAllButton, ProjectGanttChart } from "./project-gantt";
import type { ProjectGanttStores } from "./project-gantt-stores";
import {
  isGroupCollapsed,
  type ProjectGroupsStore,
} from "./project-groups-store";
import {
  type ProjectLayoutStore,
  projectLayoutFrom,
} from "./project-layout-store";

export interface ProjectsViewDeps {
  readProjectList: ReadProjectList;
  /** With a project scope, for the project details. */
  readAllTasks: ReadAllTasks;
  /** The current logical day, for dates and overdue. */
  today: () => CalendarDate;
  /** Tasks or projects may have changed: the list is read again. */
  changes: ChangeSignalSource;
  /** "Open in notes" and notices. */
  taskActions: TaskActionsDeps;
  /** The project menu's registrations, for the rows' status icon and right-click. */
  projectMenuItems: () => ProjectMenuItems | undefined;
  /** The collapsed groups, kept in the plugin instance's memory. */
  groups: ProjectGroupsStore;
  /** The project open, `null` for the list; in the plugin instance's memory. */
  openProject: OpenProjectStore;
  /** The task menu's registrations, for a right-click on a card (#157). */
  menuItems: () => TaskMenuItems | undefined;
  /** The filter's contexts and labels to offer: the task panel's. */
  readCandidates: ReadCandidates;
  /** Dragging a card onto another or into a gap moves its block. */
  moveTask: MoveTask;
  /**
   * Whether a details tree move crosses the project block, asked first
   * when it does (#157).
   */
  readMoveCrossing: ReadMoveCrossing;
  /** A card dropped on a block in a note panel links the task there. */
  linkTaskInNote: LinkTaskInNote;
  /**
   * The project details' tree state (#157), in the plugin instance's
   * memory apart from the all tasks view's. The filter, search text, sort
   * and "show earlier" start over when another project opens; the collapsed
   * tasks are kept, by task.
   */
  details: TaskTreeStores;
  /** The project board's read (#166). */
  readProjectBoard: ReadProjectBoard;
  /**
   * The project details' layout, one for every project, in the plugin
   * instance's memory; the default layout setting overrides it.
   */
  layout: ProjectLayoutStore;
  /** The board's own state, apart from the tree's (#166). */
  board: ProjectBoardStores;
  /**
   * The board's and the gantt chart's "Create task", its 所属项目 filled in
   * with the project.
   */
  openQuickCapture: OpenQuickCapture;
  /** The project gantt chart's read (#186). */
  readProjectGantt: ReadProjectGantt;
  /** The gantt chart's own state, apart from the tree's and the board's. */
  gantt: ProjectGanttStores;
}

/**
 * One project status's group: its toggle with the count, then its project
 * rows. The review's projects step shows its groups with it too (#161), a
 * project kept there after it left the step faded.
 */
export function ProjectGroupPart(props: {
  group: ProjectGroup;
  collapsed: boolean;
  onToggle: () => void;
  today: CalendarDate;
  actions: TaskActions;
  menuItems: ProjectMenuItems | undefined;
  /** Opens the project details of project `id`. */
  onOpen: (id: ProjectId) => void;
  /** Each row's action button (the review's "Create task", #162). */
  action?: (id: ProjectId) => React.ReactNode;
}) {
  const { group, collapsed } = props;
  return (
    <section className="nextaction-project-group">
      <button
        type="button"
        className="nextaction-project-group-toggle"
        aria-expanded={!collapsed}
        onClick={props.onToggle}
      >
        <i
          className={collapsed ? "ti ti-chevron-right" : "ti ti-chevron-down"}
          aria-hidden="true"
        />
        {projectStatusLabel(group.status)}
        <span className="nextaction-project-group-count">
          {group.projects.length}
        </span>
      </button>
      {!collapsed && (
        <ul className="nextaction-project-group-list">
          {group.projects.map((node) => (
            <li
              key={node.project.id}
              className="nextaction-project-group-item"
              data-kept={node.faded === "kept" || undefined}
            >
              <ProjectRow
                node={node}
                today={props.today}
                menuItems={props.menuItems}
                onActivate={() => props.onOpen(node.project.id)}
                onOpenInNotes={() =>
                  props.actions.openBlockInNotes(node.project.id)
                }
                action={props.action?.(node.project.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The project tag is paused (#143): the review's projects step says it too. */
export function ProjectsPausedNotice() {
  return (
    <ViewNotice
      icon="ti ti-player-pause"
      title={t("Projects are paused")}
      detail={t(
        "The project tag could not be set up. Check the project tag name in the plugin settings.",
      )}
    />
  );
}

function ProjectsContent(props: {
  query: ViewQuery<ProjectListRead>;
  today: CalendarDate;
  deps: ProjectsViewDeps;
}) {
  const { query, today, deps } = props;
  const state = useViewQuery(query);
  const actions = useTaskActions(deps.taskActions);
  const turned = React.useSyncExternalStore(
    deps.groups.subscribe,
    deps.groups.current,
  );

  if (state.kind === "loading") return <TaskListPlaceholder />;
  // Task features paused: nothing can be read.
  if (state.kind === "paused") return <PausedNotice />;
  if (state.kind === "failed") {
    return (
      <FailedNotice
        error={state.error}
        message={(reason) =>
          t("Could not read the projects: ${reason}", { reason })
        }
        onRetry={() => query.reset()}
      />
    );
  }
  if (state.data.kind === "paused") return <ProjectsPausedNotice />;
  const { groups } = state.data;
  if (groups.length === 0) {
    return (
      <ViewNotice
        icon="ti ti-folder"
        title={t("No projects yet")}
        detail={t(
          "To start a project, add the project tag to a page or block in Orca.",
        )}
      />
    );
  }
  const menuItems = deps.projectMenuItems();
  return (
    <div className="nextaction-project-groups">
      {groups.map((group) => (
        <ProjectGroupPart
          key={group.status}
          group={group}
          collapsed={isGroupCollapsed(turned, group.status)}
          onToggle={() => deps.groups.toggle(group.status)}
          today={today}
          actions={actions}
          menuItems={menuItems}
          onOpen={deps.openProject.set}
        />
      ))}
    </div>
  );
}

/**
 * The project details in either layout: what a read needs (loading, failure,
 * no such project), then the attribute area and the layout's part.
 */
function DetailsContent<
  R extends ProjectScopeRead | ProjectBoardRead | ProjectGanttRead,
>(props: {
  query: ViewQuery<R>;
  today: CalendarDate;
  deps: ProjectsViewDeps;
  /** The layout's toolbar and tasks under the attribute area. */
  render: (
    read: Extract<R, { kind: "project" }>,
    actions: TaskActions,
  ) => React.ReactNode;
}) {
  const { query, today, deps } = props;
  const state = useViewQuery(query);
  const actions = useTaskActions(deps.taskActions);
  const gone = state.kind === "loaded" && state.data.kind === "noProject";
  // No longer a project (dropped, its tag removed, the tag paused): back to
  // the list, which tells a paused project tag apart.
  React.useEffect(() => {
    if (gone) deps.openProject.set(null);
  }, [gone, deps.openProject]);

  if (state.kind === "loading") return <TaskListPlaceholder />;
  // Task features paused: nothing can be read.
  if (state.kind === "paused") return <PausedNotice />;
  if (state.kind === "failed") {
    return (
      <FailedNotice
        error={state.error}
        message={(reason) =>
          t("Could not read the project: ${reason}", { reason })
        }
        onRetry={() => query.reset()}
      />
    );
  }
  if (state.data.kind === "noProject") return null;
  const read = state.data as Extract<R, { kind: "project" }>;
  return (
    <>
      <ProjectAttributes
        node={read.project}
        today={today}
        menuItems={deps.projectMenuItems()}
        onOpenInNotes={() => actions.openBlockInNotes(read.project.project.id)}
      />
      {props.render(read, actions)}
    </>
  );
}

/**
 * The layout switch (#166), first in the toolbar: icons only, one choice for
 * every project, kept in memory.
 */
function LayoutSwitch(props: { store: ProjectLayoutStore }) {
  const { Segmented } = orca.components;
  const layout = React.useSyncExternalStore(
    props.store.subscribe,
    props.store.current,
  );
  const icon = (className: string, label: string) => (
    <span
      className="nextaction-layout-icon"
      role="img"
      aria-label={label}
      title={label}
    >
      <i className={className} aria-hidden="true" />
    </span>
  );
  return (
    <Segmented
      role="group"
      aria-label={t("Layout")}
      className="nextaction-layout-switch"
      selected={layout}
      options={[
        { value: "tree", jsx: icon("ti ti-list-tree", t("Tree")) },
        { value: "board", jsx: icon("ti ti-layout-kanban", t("Board")) },
        { value: "gantt", jsx: icon("ti ti-timeline", t("Gantt")) },
      ]}
      onChange={(value) => props.store.set(projectLayoutFrom(value))}
    />
  );
}

/**
 * The board's grouping switch (GLOSSARY: 分列方式, #171), beside the layout
 * switch: one choice for every project, kept in memory.
 */
function GroupingSwitch(props: { store: BoardGroupingStore }) {
  const { Segmented } = orca.components;
  const grouping = React.useSyncExternalStore(
    props.store.subscribe,
    props.store.current,
  );
  return (
    <Segmented
      role="group"
      aria-label={t("Grouping")}
      className="nextaction-layout-switch"
      selected={grouping}
      options={[
        { value: "status", label: t("By status") },
        { value: "root", label: t("By root task") },
      ]}
      onChange={(value) =>
        props.store.set(value === "root" ? "root" : "status")
      }
    />
  );
}

/**
 * The board layout's toolbar and board (#166): the layout switch, the
 * board's own sort and "Create task" (quick capture, 所属项目 filled in with
 * this project), "collapse all / expand all" over the cards' subtasks
 * (#167), then the columns. The search box and filter are the tree's, on
 * the same store (#172): switching layout keeps them.
 */
function DetailsBoard(props: {
  read: Extract<ProjectBoardRead, { kind: "project" }>;
  today: CalendarDate;
  actions: TaskActions;
  deps: ProjectsViewDeps;
}) {
  const { read, today, actions, deps } = props;
  const stores = deps.board;
  // As the tree's moves (#157): crossing the project block's boundary asks.
  const moveTask = useMoveTask(deps.moveTask, deps.taskActions.notify);
  const { onMove, confirmation } = useMoveConfirmation({
    project: read.project.project.id,
    readMoveCrossing: deps.readMoveCrossing,
    move: moveTask,
    notify: deps.taskActions.notify,
  });
  const linkTaskInNote = useLinkTaskInNote(
    deps.linkTaskInNote,
    deps.taskActions.notify,
  );
  const { selectedTaskId, selectTask } = usePanel();
  const menuPlace = React.useMemo(() => ({ selectTask }), [selectTask]);
  const sort = React.useSyncExternalStore(
    stores.sort.subscribe,
    stores.sort.current,
  );
  // The tree's filter and search text, shared with it (#172).
  const filterStore = deps.details.filter;
  const filter = React.useSyncExternalStore(
    filterStore.subscribe,
    filterStore.current,
  );
  const filtering = isFilteringAllTasks(filter);
  const candidates = useCandidates(
    deps.readCandidates,
    deps.changes,
    deps.taskActions.notify,
  );
  const { Button, Tooltip } = orca.components;
  const project = read.project.project.id;
  const board = read.board;
  // By status the columns stay, empty ones too: the board shows. By project
  // root task the read leaves out every column nothing passes in, "Other"
  // too.
  const empty =
    board.grouping === "root" &&
    board.columns.length === 0 &&
    board.other.cards.length + board.other.done.length === 0;
  return (
    <>
      <div className="nextaction-toolbar">
        <LayoutSwitch store={deps.layout} />
        <GroupingSwitch store={stores.grouping} />
        <AllTasksSearchBox
          search={filter.search}
          onChange={(search) => filterStore.set({ ...filter, search })}
        />
        <div className="nextaction-toolbar-view">
          <AllTasksSortSelect state={sort} onChange={stores.sort.set} />
          <BoardCollapseAllButton
            board={read.board}
            expanded={stores.expanded}
          />
          <AllTasksFilterButton
            state={filter}
            candidates={candidates}
            onChange={filterStore.set}
          />
          <Tooltip text={t("Create task")}>
            <Button
              variant="plain"
              className="nextaction-toolbar-button"
              aria-label={t("Create task")}
              onClick={() => deps.openQuickCapture(project)}
            >
              <i className="ti ti-circle-plus" aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>
      </div>
      {filtering && empty ? (
        // As the tree's: nothing passes, a way back.
        <ViewNotice
          icon="ti ti-filter-off"
          title={t("No tasks match the filter")}
          action={
            <Button variant="outline" onClick={filterStore.clear}>
              {t("Clear filter")}
            </Button>
          }
        />
      ) : (
        <CardDragArea onNoteDrop={linkTaskInNote}>
          <ProjectBoardColumns
            board={read.board}
            project={project}
            // Narrowed: no empty "Other" (#172).
            filtering={filtering}
            doneColumn={stores.doneColumn}
            rootColumns={stores}
            onMove={onMove}
            cards={{
              today,
              actions,
              menuItems: deps.menuItems(),
              menuPlace,
              selectedTaskId,
              selectTask,
              expanded: stores.expanded,
            }}
          />
        </CardDragArea>
      )}
      {confirmation}
    </>
  );
}

/**
 * The gantt layout's toolbar and chart (#186): the layout switch, the
 * tree's search box and filter on the same store (switching layout keeps
 * them), "collapse all / expand all" over the chart's own collapsed rows,
 * and "Create task" as the board's; then the chart. No sort: the rows keep
 * note order.
 */
function DetailsGantt(props: {
  read: Extract<ProjectGanttRead, { kind: "project" }>;
  today: CalendarDate;
  deps: ProjectsViewDeps;
}) {
  const { read, today, deps } = props;
  const { selectedTaskId, selectTask } = usePanel();
  const filterStore = deps.details.filter;
  const filter = React.useSyncExternalStore(
    filterStore.subscribe,
    filterStore.current,
  );
  const filtering = isFilteringAllTasks(filter);
  const candidates = useCandidates(
    deps.readCandidates,
    deps.changes,
    deps.taskActions.notify,
  );
  const { Button, Tooltip } = orca.components;
  const project = read.project.project.id;
  const empty = read.gantt.rows.length === 0;
  return (
    <>
      <div className="nextaction-toolbar">
        <LayoutSwitch store={deps.layout} />
        <AllTasksSearchBox
          search={filter.search}
          onChange={(search) => filterStore.set({ ...filter, search })}
        />
        <div className="nextaction-toolbar-view">
          <GanttCollapseAllButton
            gantt={read.gantt}
            expanded={deps.gantt.expanded}
          />
          <AllTasksFilterButton
            state={filter}
            candidates={candidates}
            onChange={filterStore.set}
          />
          <Tooltip text={t("Create task")}>
            <Button
              variant="plain"
              className="nextaction-toolbar-button"
              aria-label={t("Create task")}
              onClick={() => deps.openQuickCapture(project)}
            >
              <i className="ti ti-circle-plus" aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>
      </div>
      {filtering && empty ? (
        <ViewNotice
          icon="ti ti-filter-off"
          title={t("No tasks match the filter")}
          action={
            <Button variant="outline" onClick={filterStore.clear}>
              {t("Clear filter")}
            </Button>
          }
        />
      ) : (
        <ProjectGanttChart
          gantt={read.gantt}
          scale="week"
          cards={{
            today,
            selectedTaskId,
            selectTask,
            expanded: deps.gantt.expanded,
          }}
        />
      )}
    </>
  );
}

/**
 * The project details' toolbar and tree (#157): the all tasks view's search
 * box, sort, "collapse all" and filter, then the shared tree and done
 * section over the scoped read, with the details' own stores.
 */
function DetailsTree(props: {
  read: Extract<ProjectScopeRead, { kind: "project" }>;
  today: CalendarDate;
  actions: TaskActions;
  deps: ProjectsViewDeps;
}) {
  const { read, today, actions, deps } = props;
  const stores = deps.details;
  const moveTask = useMoveTask(deps.moveTask, deps.taskActions.notify);
  const { onMove, confirmation } = useMoveConfirmation({
    project: read.project.project.id,
    readMoveCrossing: deps.readMoveCrossing,
    move: moveTask,
    notify: deps.taskActions.notify,
  });
  const linkTaskInNote = useLinkTaskInNote(
    deps.linkTaskInNote,
    deps.taskActions.notify,
  );
  const { selectedTaskId, selectTask } = usePanel();
  const menuPlace = React.useMemo(() => ({ selectTask }), [selectTask]);
  const collapsed = React.useSyncExternalStore(
    stores.collapse.subscribe,
    stores.collapse.current,
  );
  const sort = React.useSyncExternalStore(
    stores.sort.subscribe,
    stores.sort.current,
  );
  const filter = React.useSyncExternalStore(
    stores.filter.subscribe,
    stores.filter.current,
  );
  const filtering = isFilteringAllTasks(filter);
  const candidates = useCandidates(
    deps.readCandidates,
    deps.changes,
    deps.taskActions.notify,
  );
  const nodes = shownNodes(read.tree, selectedTaskId);
  const done = read.done;
  const cards: TaskTreeCards = {
    today,
    actions,
    menuItems: deps.menuItems(),
    menuPlace,
    projectMenuItems: deps.projectMenuItems(),
    selectedTaskId,
    selectTask,
    collapsed,
    toggleCollapsed: stores.collapse.toggle,
    topLevelGaps: sort.sort === "note",
    // No project rows in a scope: nothing to expand for the filter.
    projectsExpanded: filtering,
  };
  const { Button } = orca.components;
  const empty = nodes.length === 0 && done.count === 0;
  return (
    <>
      <div className="nextaction-toolbar">
        <LayoutSwitch store={deps.layout} />
        <AllTasksSearchBox
          search={filter.search}
          onChange={(search) => stores.filter.set({ ...filter, search })}
        />
        <div className="nextaction-toolbar-view">
          <AllTasksSortSelect state={sort} onChange={stores.sort.set} />
          <CollapseAllButton
            nodes={nodes}
            collapse={stores.collapse}
            projectsExpanded={filtering}
          />
          <AllTasksFilterButton
            state={filter}
            candidates={candidates}
            onChange={stores.filter.set}
          />
        </div>
      </div>
      {filtering && empty ? (
        <>
          <ViewNotice
            icon="ti ti-filter-off"
            title={t("No tasks match the filter")}
            action={
              <Button variant="outline" onClick={stores.filter.clear}>
                {t("Clear filter")}
              </Button>
            }
          />
          <CardDragArea onNoteDrop={linkTaskInNote}>
            <TaskDoneSection
              done={done}
              cards={cards}
              store={stores.doneSection}
            />
          </CardDragArea>
        </>
      ) : empty && !done.hasEarlier ? (
        <ViewNotice icon="ti ti-list-tree" title={t("No tasks")} />
      ) : (
        <TaskDragArea onMove={onMove} onNoteDrop={linkTaskInNote}>
          {nodes.length > 0 && <TaskTree nodes={nodes} cards={cards} />}
          <TaskDoneSection
            done={done}
            cards={cards}
            store={stores.doneSection}
          />
        </TaskDragArea>
      )}
      {confirmation}
    </>
  );
}

/**
 * The projects view. Its query starts when the view shows and stops when it
 * goes, so every opening starts from what the notes hold then.
 */
export function createProjectsView(deps: ProjectsViewDeps): PanelView {
  const query = createViewQuery(() => deps.readProjectList(), deps.changes);
  const stores = deps.details;
  /**
   * The selected task, kept by every details read while it is selected, as
   * in the all tasks view. One value: there is at most one plugin panel.
   */
  let selected: TaskId | undefined;
  // Reads the project open at the time of each read.
  const details = createViewQuery(async (): Promise<ProjectScopeRead> => {
    const project = deps.openProject.current();
    if (project === null) return { kind: "noProject" };
    return deps.readAllTasks({
      project,
      keep: selected,
      sort: stores.sort.current().sort,
      direction: stores.sort.current().direction,
      showEarlierDone: stores.doneSection.current().showEarlier,
      filter: stores.filter.current().filter,
      search: stores.filter.current().search,
    });
  }, deps.changes);
  // The board's read (#166): only while the board shows, as the tree's only
  // while the tree does.
  const boardStores = deps.board;
  const boardQuery = createViewQuery(async (): Promise<ProjectBoardRead> => {
    const project = deps.openProject.current();
    if (project === null) return { kind: "noProject" };
    return deps.readProjectBoard({
      project,
      grouping: boardStores.grouping.current(),
      sort: boardStores.sort.current().sort,
      direction: boardStores.sort.current().direction,
      // The tree's filter and search text, shared (#172): switching layout
      // keeps them.
      filter: stores.filter.current().filter,
      search: stores.filter.current().search,
    });
  }, deps.changes);
  boardStores.sort.subscribe(() => boardQuery.reload());
  stores.filter.subscribe(() => boardQuery.reload());
  boardStores.grouping.subscribe(() => boardQuery.reload());
  // The gantt chart's read (#186): only while the chart shows, likewise.
  // Collapsing only renders what is read.
  const ganttQuery = createViewQuery(async (): Promise<ProjectGanttRead> => {
    const project = deps.openProject.current();
    if (project === null) return { kind: "noProject" };
    return deps.readProjectGantt({
      project,
      // The tree's filter and search text, shared: switching layout keeps
      // them.
      filter: stores.filter.current().filter,
      search: stores.filter.current().search,
    });
  }, deps.changes);
  stores.filter.subscribe(() => ganttQuery.reload());
  // Another project opened: its filter, search text, sort and "show
  // earlier" start over; the collapsed tasks stay, by task. Going back to
  // the list and into the same project keeps them. Lives as long as the
  // plugin instance.
  let lastOpened: ProjectId | null = null;
  deps.openProject.subscribe(() => {
    const open = deps.openProject.current();
    if (open === null || open === lastOpened) return;
    lastOpened = open;
    stores.filter.clear();
    stores.sort.clear();
    stores.doneSection.set({
      ...stores.doneSection.current(),
      showEarlier: false,
    });
    // The board's sort and earlier done cards likewise (as phase two's).
    boardStores.sort.clear();
    boardStores.doneColumn.set({
      ...boardStores.doneColumn.current(),
      showEarlier: false,
    });
  });
  // A new sort, filter or search text reads again; so does showing earlier
  // items, while expanding only renders what is read.
  stores.sort.subscribe(() => details.reload());
  stores.filter.subscribe(() => details.reload());
  let showEarlier = stores.doneSection.current().showEarlier;
  stores.doneSection.subscribe(() => {
    const next = stores.doneSection.current().showEarlier;
    if (next === showEarlier) return;
    showEarlier = next;
    details.reload();
  });

  function ProjectsView() {
    const open = React.useSyncExternalStore(
      deps.openProject.subscribe,
      deps.openProject.current,
    );
    const layout = React.useSyncExternalStore(
      deps.layout.subscribe,
      deps.layout.current,
    );
    const { selectedTaskId } = usePanel();
    // The board and the gantt chart need the width: no side pane beside
    // them, even in the wide tier; their tasks open in the popup. From the
    // moment they open, while they still read, so the pane does not come
    // and go.
    useWithoutSidePane(open !== null && layout !== "tree");
    // As in the all tasks view: a new selection reads again, so a task kept
    // for the earlier one leaves at once.
    const readFor = React.useRef<TaskId | undefined>(undefined);
    React.useEffect(() => {
      selected = selectedTaskId;
      if (readFor.current !== selectedTaskId) {
        readFor.current = selectedTaskId;
        details.reload();
      }
      return () => {
        selected = undefined;
      };
    }, [selectedTaskId]);
    // A project opens only from the list, where the details query stops and
    // forgets what it read: nothing of the one before shows for it.
    if (open === null) {
      return (
        <>
          <ViewHeader title={t("Projects")} />
          <ProjectsContent query={query} today={deps.today()} deps={deps} />
        </>
      );
    }
    const today = deps.today();
    return (
      <div className="nextaction-project-details" data-layout={layout}>
        <BackToProjects onBack={() => deps.openProject.set(null)} />
        {layout === "gantt" ? (
          <DetailsContent
            key="gantt"
            query={ganttQuery}
            today={today}
            deps={deps}
            render={(read) => (
              <DetailsGantt read={read} today={today} deps={deps} />
            )}
          />
        ) : layout === "board" ? (
          <DetailsContent
            key="board"
            query={boardQuery}
            today={today}
            deps={deps}
            render={(read, actions) => (
              <DetailsBoard
                read={read}
                today={today}
                actions={actions}
                deps={deps}
              />
            )}
          />
        ) : (
          <DetailsContent
            key="tree"
            query={details}
            today={today}
            deps={deps}
            render={(read, actions) => (
              <DetailsTree
                read={read}
                today={today}
                actions={actions}
                deps={deps}
              />
            )}
          />
        )}
      </div>
    );
  }

  return {
    id: "projects",
    // After the all tasks view (20), before the review (30). No count in the
    // navigation (#153).
    order: 25,
    icon: "ti ti-folder",
    label: () => t("Projects"),
    component: ProjectsView,
    // In the project details, the navigation item goes back to the list; in
    // the list it changes nothing.
    onReselect: () => deps.openProject.set(null),
  };
}
