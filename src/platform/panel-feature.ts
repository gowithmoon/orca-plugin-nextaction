import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../application/ports/start-preview-days-setting";
import type { TaskRepository } from "../application/ports/task-repository";
import { createAddToMyDay } from "../application/usecases/add-to-my-day";
import { createMoveTask } from "../application/usecases/move-task";
import { createReadAllTasks } from "../application/usecases/read-all-tasks";
import { createReadCandidates } from "../application/usecases/read-candidates";
import { createReadInbox } from "../application/usecases/read-inbox";
import { createReadMyDay } from "../application/usecases/read-my-day";
import { createReadMyDayCandidates } from "../application/usecases/read-my-day-candidates";
import { createReadNextActions } from "../application/usecases/read-next-actions";
import { createScheduleInMyDay } from "../application/usecases/schedule-in-my-day";
import { createUnscheduleInMyDay } from "../application/usecases/unschedule-in-my-day";
import type { CalendarDate } from "../domain/task/task";
import { systemClock } from "../infra/system-clock";
import type { ChangeSignal } from "../shared/change-signal";
import type { TaskActionsDeps } from "../ui/hooks/use-task-actions";
import type { EditorHost } from "../ui/panel/hidden-editor";
import { createNextActionPanel } from "../ui/panel/nextaction-panel";
import { createPanelButton } from "../ui/panel/panel-button";
import { createPanelViews, type PanelViews } from "../ui/panel/panel-views";
import { componentCss } from "../ui/styles/component-style";
import { myDayCss } from "../ui/styles/my-day-style";
import { panelCss } from "../ui/styles/panel-style";
import { taskDragCss } from "../ui/styles/task-drag-style";
import type { TaskMenuItems } from "../ui/task-menu/menu-items";
import type { TaskPanelFormDeps } from "../ui/task-panel/task-panel-form";
import type { OpenTaskPanelPopup } from "../ui/task-panel/task-panel-popup";
import { createTaskPanelSidePane } from "../ui/task-panel/task-panel-side-pane";
import { createAllTasksCollapseStore } from "../ui/views/all-tasks/all-tasks-collapse-store";
import { createAllTasksFilterStore } from "../ui/views/all-tasks/all-tasks-filter-store";
import { createAllTasksSortStore } from "../ui/views/all-tasks/all-tasks-sort-store";
import { createAllTasksView } from "../ui/views/all-tasks/all-tasks-view";
import { createDoneSectionStore } from "../ui/views/all-tasks/done-section-store";
import { createInboxView } from "../ui/views/inbox/inbox-view";
import { createMyDayView } from "../ui/views/my-day/my-day-view";
import { createSchedulePopup } from "../ui/views/my-day/schedule-popup";
import { createNextActionFilterStore } from "../ui/views/next-action/next-action-filter-store";
import { createNextActionView } from "../ui/views/next-action/next-action-view";
import type { FeatureModule } from "./bootstrap";
import { createPanelPlacement } from "./panel-placement";

/** The plugin panel's type for the load of `pluginName`. */
export function pluginPanelType(pluginName: string): string {
  return `${pluginName}.panel`;
}

/**
 * The plugin panel (#36): the editor sidetool button, the panel type and its
 * style sheet, with the next action view (#53), the My Day view (#83), the
 * inbox view (#37), the all tasks view (#65) and their card actions (#39). `views`
 * is the navigation's registration; later features append their views to it
 * before this feature loads.
 */
export function createPanelFeature(deps: {
  repository: TaskRepository;
  /** The task change signal; focus and the refresh button give it at once. */
  changes: ChangeSignal;
  /** The current logical day, for dates and overdue. */
  today: () => CalendarDate;
  /** The day boundary, for the logical day the next actions are read on. */
  dayBoundary: DayBoundarySetting;
  /** The start preview days, for how far ahead the next actions look. */
  startPreviewDays: StartPreviewDaysSetting;
  /** The cards' status change, "open in notes" and notices (#39). */
  taskActions: TaskActionsDeps;
  /** The current load's task menu registrations, for a right-click on a card. */
  menuItems: () => TaskMenuItems | undefined;
  /**
   * The task panel (#40, #42): the selected task shows in the side pane in
   * the wide tier and in the popup otherwise.
   */
  taskPanel: { openPopup: OpenTaskPanelPopup; formDeps: TaskPanelFormDeps };
  /** The block the panel's hidden editor shows: the task tag block. */
  editorHost: EditorHost;
}): { feature: FeatureModule; views: PanelViews } {
  const { repository, changes, taskPanel } = deps;
  const views = createPanelViews();
  // The next action view's filter (#55): in memory only, so it outlives the
  // plugin panel closing and is gone with the load (cleared on release).
  const nextActionFilter = createNextActionFilterStore();
  // The all tasks view's collapsed nodes (#67): in memory only, likewise.
  const allTasksCollapse = createAllTasksCollapseStore();
  // The all tasks view's sort (#68): in memory only, likewise.
  const allTasksSort = createAllTasksSortStore();
  // The all tasks view's done section (#66): in memory only, as the filter.
  const doneSection = createDoneSectionStore();
  // The all tasks view's filter and search text (#69): in memory only, apart
  // from the next action view's filter.
  const allTasksFilter = createAllTasksFilterStore();
  const readCandidates = createReadCandidates({ repository });
  views.register(
    createNextActionView({
      readNextActions: createReadNextActions({
        repository,
        clock: systemClock,
        dayBoundary: deps.dayBoundary,
        startPreviewDays: deps.startPreviewDays,
      }),
      today: deps.today,
      changes,
      taskActions: deps.taskActions,
      menuItems: deps.menuItems,
      readCandidates,
      filter: nextActionFilter,
    }),
  );
  const myDayDeps = {
    repository,
    clock: systemClock,
    dayBoundary: deps.dayBoundary,
  };
  // The schedule popup's root (#84) exists only while loaded.
  let renderSchedulePopup: (node: React.ReactNode) => void = () => {};
  views.register(
    createMyDayView({
      readMyDay: createReadMyDay({
        ...myDayDeps,
        startPreviewDays: deps.startPreviewDays,
      }),
      readMyDayCandidates: createReadMyDayCandidates(myDayDeps),
      addToMyDay: createAddToMyDay(myDayDeps),
      today: deps.today,
      now: () => systemClock.now(),
      changes,
      taskActions: deps.taskActions,
      menuItems: deps.menuItems,
      openSchedulePopup: createSchedulePopup({
        deps: {
          scheduleInMyDay: createScheduleInMyDay(myDayDeps),
          unscheduleInMyDay: createUnscheduleInMyDay(myDayDeps),
          notify: deps.taskActions.notify,
        },
        // Into the load's root; nothing outside a load.
        render: (node) => renderSchedulePopup(node),
      }),
    }),
  );
  views.register(
    createInboxView({
      readInbox: createReadInbox({ repository }),
      today: deps.today,
      changes,
      taskActions: deps.taskActions,
      menuItems: deps.menuItems,
    }),
  );
  views.register(
    createAllTasksView({
      readAllTasks: createReadAllTasks({
        repository,
        clock: systemClock,
        dayBoundary: deps.dayBoundary,
        startPreviewDays: deps.startPreviewDays,
      }),
      today: deps.today,
      changes,
      taskActions: deps.taskActions,
      menuItems: deps.menuItems,
      collapse: allTasksCollapse,
      sort: allTasksSort,
      doneSection,
      readCandidates,
      filter: allTasksFilter,
      moveTask: createMoveTask({ repository }),
    }),
  );
  // Created once, so the panel's renderer keeps the same component.
  const refresh = () => changes.now();
  const panelRenderer = createNextActionPanel({
    views,
    sidePane: createTaskPanelSidePane(taskPanel.formDeps),
    openPopup: taskPanel.openPopup,
    onRefresh: refresh,
    editorHost: deps.editorHost,
    // Changes made elsewhere without a hook (e.g. sync) show on return.
    onActivated: refresh,
  });

  const feature: FeatureModule = (context) => {
    const { pluginName, registry } = context;
    // Identifiers share one namespace across kinds: the style sheet must not
    // be named like the panel type.
    // Each load is a new module instance already (plugin-lifecycle-settings);
    // clearing on release also covers a load → unload → load in one instance.
    registry.add(`${pluginName}.nextActionFilter`, nextActionFilter.clear);
    registry.add(`${pluginName}.allTasksCollapse`, allTasksCollapse.clear);
    registry.add(`${pluginName}.allTasksSort`, allTasksSort.clear);
    registry.add(`${pluginName}.doneSection`, doneSection.clear);
    registry.add(`${pluginName}.allTasksFilter`, allTasksFilter.clear);
    registry.css("panelStyle", panelCss);
    registry.css("componentStyle", componentCss);
    registry.css("taskDragStyle", taskDragCss);
    registry.css("myDayStyle", myDayCss);
    // Its own root, as the task panel popup's: the view's container query
    // would hold a fixed window inside the view. Created before the panel,
    // so it is released after it; then nothing renders into it any more.
    const schedulePopupRoot = registry.reactRoot("schedulePopup", null);
    renderSchedulePopup = schedulePopupRoot.render;
    registry.add(`${pluginName}.schedulePopupOpen`, () => {
      renderSchedulePopup = () => {};
    });
    const placement = createPanelPlacement(pluginPanelType(pluginName));
    // Released before the style sheet: open panels are restored or closed
    // first, then the type is unregistered (ADR 0011).
    registry.panel("panel", panelRenderer, {
      closePanel: placement.close,
    });
    registry.editorSidetool(
      "panelButton",
      createPanelButton(placement.toggle, pluginName),
    );
  };
  return { feature, views };
}
