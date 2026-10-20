// The task map (GLOSSARY: 任务全景图, #213): every task not done, in its
// project's box or the no-project area, nested by block, drawn on a canvas
// that pans and zooms (task-map-canvas.tsx). It reads when the plugin panel
// opens and again on every task change signal (ADR 0007). The task panel
// opens in its popup. The header's filter button chooses the projects and
// the two toggles (#217), kept in the task map's stores; each change reads
// again. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { MoveTask } from "../../../application/usecases/move-task";
import type {
  ReadTaskMap,
  TaskMapEndpoint,
  TaskMapRead,
} from "../../../application/usecases/read-task-map";
import type { CalendarDate } from "../../../domain/task/task";
import type { ChangeSignalSource } from "../../../shared/change-signal";
import { t } from "../../../shared/l10n/l10n";
import { TaskListPlaceholder } from "../../components/loading-placeholder";
import { ViewHeader } from "../../components/view-header";
import {
  FailedNotice,
  PausedNotice,
  ViewNotice,
} from "../../components/view-notice";
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
import { usePanel, useWithoutSidePane } from "../../panel/panel-context";
import type { PanelView } from "../../panel/panel-views";
import type { TaskMenuItems } from "../../task-menu/menu-items";
import { EndpointMarkerProvider } from "./endpoint-marker";
import { TaskMapCanvas } from "./task-map-canvas";
import { TaskMapDragArea } from "./task-map-drag";
import { type TaskMapEditsDeps, TaskMapEditsProvider } from "./task-map-edits";
import { revealed } from "./task-map-filter";
import { TaskMapFilterButton } from "./task-map-filter-button";
import type { TaskMapStores } from "./task-map-stores";

export interface TaskMapViewDeps {
  readTaskMap: ReadTaskMap;
  /** The current logical day, for dates and overdue. */
  today: () => CalendarDate;
  /** Tasks may have changed: the map is read again. */
  changes: ChangeSignalSource;
  /** The cards' status menu and "open in notes". */
  taskActions: TaskActionsDeps;
  /** The task menu's registrations, for a right-click on a card. */
  menuItems: () => TaskMenuItems | undefined;
  /** The pan and zoom and the filter, kept while the plugin instance lives. */
  stores: TaskMapStores;
  /** Dragging a card onto another card or a box (#216). */
  moveTask: MoveTask;
  /** Sequential, the dependency mode and delay, edited on the map (#220). */
  edits: TaskMapEditsDeps;
}

function TaskMapContent(props: {
  query: ViewQuery<TaskMapRead>;
  deps: TaskMapViewDeps;
}) {
  const { query, deps } = props;
  const state = useViewQuery(query);
  const actions = useTaskActions(deps.taskActions);
  const moveTask = useMoveTask(deps.moveTask, deps.taskActions.notify);
  const { selectedTaskId, selectTask } = usePanel();
  const menuPlace = React.useMemo(() => ({ selectTask }), [selectTask]);
  const today = deps.today();
  const menuItems = deps.menuItems();
  const { filter, locate } = deps.stores;
  const markerDeps = React.useMemo(
    () => ({
      projects: state.kind === "loaded" ? state.data.projects : [],
      reveal: (endpoint: TaskMapEndpoint) => {
        locate.set(endpoint.other.id);
        filter.set(revealed(filter.current(), endpoint.reveal));
      },
    }),
    [state, filter, locate],
  );
  const cardDeps = React.useMemo(
    () => ({
      today,
      actions,
      menuItems,
      menuPlace,
      selectTask,
      selectedTaskId,
    }),
    [today, actions, menuItems, menuPlace, selectTask, selectedTaskId],
  );

  if (state.kind === "loading") return <TaskListPlaceholder />;
  if (state.kind === "paused") return <PausedNotice />;
  if (state.kind === "failed") {
    return (
      <FailedNotice
        error={state.error}
        message={(reason) =>
          t("Could not read the task map: ${reason}", { reason })
        }
        onRetry={() => query.reset()}
      />
    );
  }
  if (state.data.areas.length === 0) {
    return filter.current().projects.length > 0 ? (
      <ViewNotice icon="ti ti-filter" title={t("No tasks match the filter")} />
    ) : (
      <ViewNotice
        icon="ti ti-sitemap"
        title={t("No tasks to show")}
        detail={t("Tasks not done appear here with how they relate.")}
      />
    );
  }
  return (
    <TaskMapEditsProvider deps={deps.edits} notify={deps.taskActions.notify}>
      <TaskMapDragArea onMove={moveTask}>
        <EndpointMarkerProvider deps={markerDeps}>
          <TaskMapCanvas
            read={state.data}
            store={deps.stores.view}
            locate={locate}
            deps={cardDeps}
          />
        </EndpointMarkerProvider>
      </TaskMapDragArea>
    </TaskMapEditsProvider>
  );
}

export function createTaskMapView(deps: TaskMapViewDeps): PanelView {
  const { filter } = deps.stores;
  const query = createViewQuery(
    () => deps.readTaskMap(filter.current()),
    deps.changes,
  );
  // Lives as long as the stores and the query do: the plugin instance.
  filter.subscribe(() => query.reload());

  function TaskMapHeaderFilter() {
    const state = useViewQuery(query);
    const current = React.useSyncExternalStore(
      filter.subscribe,
      filter.current,
    );
    // The choices from the last read; none yet while loading.
    const projects = React.useRef<TaskMapRead["projects"]>([]);
    if (state.kind === "loaded") projects.current = state.data.projects;
    return (
      <TaskMapFilterButton
        filter={current}
        projects={projects.current}
        onChange={(next) => filter.set(next)}
      />
    );
  }

  function TaskMapView() {
    // The canvas needs the width: tasks open in the task panel's popup.
    useWithoutSidePane(true);
    return (
      <div className="nextaction-task-map">
        <ViewHeader title={t("Task map")} actions={<TaskMapHeaderFilter />} />
        <TaskMapContent query={query} deps={deps} />
      </div>
    );
  }

  return {
    id: "task-map",
    order: 27,
    icon: "ti ti-sitemap",
    label: () => t("Task map"),
    component: TaskMapView,
  };
}
