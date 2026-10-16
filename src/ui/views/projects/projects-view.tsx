// The projects view (GLOSSARY: 项目视图, #155): for now only the project list,
// every project grouped by project status, each as the project row of the
// all tasks view (GLOSSARY: 项目行). Groups collapse, the done group by
// default. After the all tasks view in the navigation, with no count there.
// It reads when the plugin panel opens and again on every task change signal
// (ADR 0007). A click on the rest of a row does nothing yet: the project
// details come with #156. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  ProjectGroup,
  ProjectListRead,
  ReadProjectList,
} from "../../../application/usecases/read-project-list";
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
import {
  isGroupCollapsed,
  type ProjectGroupsStore,
} from "./project-groups-store";

export interface ProjectsViewDeps {
  readProjectList: ReadProjectList;
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
}

function GroupPart(props: {
  group: ProjectGroup;
  collapsed: boolean;
  onToggle: () => void;
  today: CalendarDate;
  actions: TaskActions;
  menuItems: ProjectMenuItems | undefined;
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
        />
      ))}
    </div>
  );
}

/**
 * The projects view. Its query starts when the view shows and stops when it
 * goes, so every opening starts from what the notes hold then.
 */
export function createProjectsView(deps: ProjectsViewDeps): PanelView {
  const query = createViewQuery(() => deps.readProjectList(), deps.changes);

  function ProjectsView() {
    return (
      <>
        <ViewHeader title={t("Projects")} />
        <ProjectsContent query={query} today={deps.today()} deps={deps} />
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
  };
}
