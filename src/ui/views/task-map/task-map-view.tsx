// The task map (GLOSSARY: 任务全景图, #213): every task not done, in its
// project's box or the no-project area, nested by block, drawn on a canvas
// that pans and zooms (task-map-canvas.tsx). It reads when the plugin panel
// opens and again on every task change signal (ADR 0007). The task panel
// opens in its popup. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  ReadTaskMap,
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
import { TaskMapCanvas } from "./task-map-canvas";
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
  /** The pan and zoom, kept while the plugin instance lives. */
  stores: TaskMapStores;
}

function TaskMapContent(props: {
  query: ViewQuery<TaskMapRead>;
  deps: TaskMapViewDeps;
}) {
  const { query, deps } = props;
  const state = useViewQuery(query);
  const actions = useTaskActions(deps.taskActions);
  const { selectedTaskId, selectTask } = usePanel();
  const menuPlace = React.useMemo(() => ({ selectTask }), [selectTask]);
  const today = deps.today();
  const menuItems = deps.menuItems();
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
    return (
      <ViewNotice
        icon="ti ti-sitemap"
        title={t("No tasks to show")}
        detail={t("Tasks not done appear here with how they relate.")}
      />
    );
  }
  return (
    <TaskMapCanvas read={state.data} store={deps.stores.view} deps={cardDeps} />
  );
}

export function createTaskMapView(deps: TaskMapViewDeps): PanelView {
  const query = createViewQuery(() => deps.readTaskMap(), deps.changes);

  function TaskMapView() {
    // The canvas needs the width: tasks open in the task panel's popup.
    useWithoutSidePane(true);
    return (
      <div className="nextaction-task-map">
        <ViewHeader title={t("Task map")} />
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
