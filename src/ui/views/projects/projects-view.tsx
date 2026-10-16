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
import type {
  ProjectScopeRead,
  ReadAllTasks,
} from "../../../application/usecases/read-all-tasks";
import type {
  ProjectGroup,
  ProjectListRead,
  ReadProjectList,
} from "../../../application/usecases/read-project-list";
import type { ProjectId } from "../../../domain/project/project";
import type { CalendarDate } from "../../../domain/task/task";
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
import type { PanelView } from "../../panel/panel-views";
import type { ProjectMenuItems } from "../../project-menu/menu-items";
import { ProjectRow } from "../all-tasks/project-row";
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
  const { project } = state.data;
  return (
    <ProjectAttributes
      node={project}
      today={today}
      menuItems={deps.projectMenuItems()}
      onOpenInNotes={() => actions.openBlockInNotes(project.project.id)}
    />
  );
}

/**
 * The projects view. Its query starts when the view shows and stops when it
 * goes, so every opening starts from what the notes hold then.
 */
export function createProjectsView(deps: ProjectsViewDeps): PanelView {
  const query = createViewQuery(() => deps.readProjectList(), deps.changes);
  // Reads the project open at the time of each read.
  const details = createViewQuery(async (): Promise<ProjectScopeRead> => {
    const project = deps.openProject.current();
    if (project === null) return { kind: "noProject" };
    return deps.readAllTasks({ project });
  }, deps.changes);

  function ProjectsView() {
    const open = React.useSyncExternalStore(
      deps.openProject.subscribe,
      deps.openProject.current,
    );
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
