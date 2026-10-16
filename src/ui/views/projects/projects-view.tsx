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
import type {
  ProjectGroup,
  ProjectListRead,
  ReadProjectList,
} from "../../../application/usecases/read-project-list";
import type { ProjectId } from "../../../domain/project/project";
import type { CalendarDate, TaskId } from "../../../domain/task/task";
import type { ChangeSignalSource } from "../../../shared/change-signal";
import { t } from "../../../shared/l10n/l10n";
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
import { usePanel } from "../../panel/panel-context";
import type { PanelView } from "../../panel/panel-views";
import type { ProjectMenuItems } from "../../project-menu/menu-items";
import type { TaskMenuItems } from "../../task-menu/menu-items";
import type { AllTasksCollapseStore } from "../all-tasks/all-tasks-collapse-store";
import {
  AllTasksFilterButton,
  AllTasksSearchBox,
} from "../all-tasks/all-tasks-filter-button";
import {
  type AllTasksFilterStore,
  isFilteringAllTasks,
} from "../all-tasks/all-tasks-filter-store";
import { AllTasksSortSelect } from "../all-tasks/all-tasks-sort-select";
import type { AllTasksSortStore } from "../all-tasks/all-tasks-sort-store";
import type { DoneSectionStore } from "../all-tasks/done-section-store";
import { ProjectRow } from "../all-tasks/project-row";
import { TaskDragArea } from "../all-tasks/task-drag";
import {
  CollapseAllButton,
  shownNodes,
  TaskDoneSection,
  TaskTree,
  type TaskTreeCards,
} from "../all-tasks/task-tree";
import type { OpenProjectStore } from "./open-project-store";
import { BackToProjects, ProjectAttributes } from "./project-details";
import {
  isGroupCollapsed,
  type ProjectGroupsStore,
} from "./project-groups-store";

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
  /** A card dropped on a block in a note panel links the task there. */
  linkTaskInNote: LinkTaskInNote;
  /**
   * The project details' tree state (#157), in the plugin instance's
   * memory apart from the all tasks view's. The filter, search text, sort
   * and "show earlier" start over when another project opens; the collapsed
   * tasks are kept, by task.
   */
  details: ProjectDetailsStores;
}

/** The project details' own stores (#157). */
export interface ProjectDetailsStores {
  collapse: AllTasksCollapseStore;
  sort: AllTasksSortStore;
  filter: AllTasksFilterStore;
  doneSection: DoneSectionStore;
}

function GroupPart(props: {
  group: ProjectGroup;
  collapsed: boolean;
  onToggle: () => void;
  today: CalendarDate;
  actions: TaskActions;
  menuItems: ProjectMenuItems | undefined;
  /** Opens the project details of project `id`. */
  onOpen: (id: ProjectId) => void;
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
            <li key={node.project.id}>
              <ProjectRow
                node={node}
                today={props.today}
                menuItems={props.menuItems}
                onToggle={() => props.onOpen(node.project.id)}
                onOpenInNotes={() =>
                  props.actions.openBlockInNotes(node.project.id)
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
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
  if (state.data.kind === "paused") {
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
        <GroupPart
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

function DetailsContent(props: {
  query: ViewQuery<ProjectScopeRead>;
  today: CalendarDate;
  deps: ProjectsViewDeps;
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
  const read = state.data;
  return (
    <>
      <ProjectAttributes
        node={read.project}
        today={today}
        menuItems={deps.projectMenuItems()}
        onOpenInNotes={() => actions.openBlockInNotes(read.project.project.id)}
      />
      <DetailsTree read={read} today={today} actions={actions} deps={deps} />
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
        <TaskDragArea onMove={moveTask} onNoteDrop={linkTaskInNote}>
          {nodes.length > 0 && <TaskTree nodes={nodes} cards={cards} />}
          <TaskDoneSection
            done={done}
            cards={cards}
            store={stores.doneSection}
          />
        </TaskDragArea>
      )}
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
    const { selectedTaskId } = usePanel();
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
    return (
      <>
        <BackToProjects onBack={() => deps.openProject.set(null)} />
        <DetailsContent query={details} today={deps.today()} deps={deps} />
      </>
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
