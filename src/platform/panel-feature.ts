import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../application/ports/start-preview-days-setting";
import type { TaskRepository } from "../application/ports/task-repository";
import { createAddToMyDay } from "../application/usecases/add-to-my-day";
import { createCompleteFullReview } from "../application/usecases/complete-full-review";
import { createDropTask } from "../application/usecases/drop-task";
import { createEditTask } from "../application/usecases/edit-task";
import { createLinkTaskInNote } from "../application/usecases/link-task-in-note";
import {
  createCanMarkReviewed,
  createMarkReviewed,
} from "../application/usecases/mark-reviewed";
import { createMoveTask } from "../application/usecases/move-task";
import { createReadAllTasks } from "../application/usecases/read-all-tasks";
import { createReadCandidates } from "../application/usecases/read-candidates";
import { createReadInbox } from "../application/usecases/read-inbox";
import { createReadMoveCrossing } from "../application/usecases/read-move-crossing";
import { createReadMyDay } from "../application/usecases/read-my-day";
import { createReadMyDayCandidates } from "../application/usecases/read-my-day-candidates";
import { createReadNextActions } from "../application/usecases/read-next-actions";
import { createReadProjectList } from "../application/usecases/read-project-list";
import { createReadReview } from "../application/usecases/read-review";
import { createReadStats } from "../application/usecases/read-stats";
import { createScheduleInMyDay } from "../application/usecases/schedule-in-my-day";
import { createUnscheduleInMyDay } from "../application/usecases/unschedule-in-my-day";
import type { CalendarDate } from "../domain/task/task";
import { createPluginDataLastFullReview } from "../infra/orca/last-full-review-store";
import { orcaNoteCursorSource } from "../infra/orca/note-cursor-source";
import { systemClock } from "../infra/system-clock";
import type { ChangeSignal, ChangeSignalSource } from "../shared/change-signal";
import type { OpenQuickCapture } from "../ui/capture/quick-capture-popup";
import { handleCardDragAltKey } from "../ui/drag/card-drag";
import type { TaskActionsDeps } from "../ui/hooks/use-task-actions";
import type { EditorHost } from "../ui/panel/hidden-editor";
import { createNextActionPanel } from "../ui/panel/nextaction-panel";
import { createPanelButton } from "../ui/panel/panel-button";
import { createPanelViews, type PanelViews } from "../ui/panel/panel-views";
import type { ProjectMenuItems } from "../ui/project-menu/menu-items";
import { cardDragCss } from "../ui/styles/card-drag-style";
import { componentCss } from "../ui/styles/component-style";
import { myDayCss } from "../ui/styles/my-day-style";
import { panelCss } from "../ui/styles/panel-style";
import { statsDistributionCss } from "../ui/styles/stats-distribution-style";
import { statsNowCss } from "../ui/styles/stats-now-style";
import { statsPeriodCss } from "../ui/styles/stats-period-style";
import { statsSelectionCss } from "../ui/styles/stats-selection-style";
import { statsCss } from "../ui/styles/stats-style";
import { taskDragCss } from "../ui/styles/task-drag-style";
import type { TaskMenuItems } from "../ui/task-menu/menu-items";
import type { OpenReviewPopup } from "../ui/task-panel/review-popup";
import type { TaskPanelFormDeps } from "../ui/task-panel/task-panel-form";
import type { OpenTaskPanelPopup } from "../ui/task-panel/task-panel-popup";
import { createTaskPanelSidePane } from "../ui/task-panel/task-panel-side-pane";
import { createAllTasksView } from "../ui/views/all-tasks/all-tasks-view";
import { createTaskTreeStores } from "../ui/views/all-tasks/task-tree-stores";
import { createInboxView } from "../ui/views/inbox/inbox-view";
import { createMyDayScheduleActions } from "../ui/views/my-day/my-day-schedule-actions";
import { createMyDayView } from "../ui/views/my-day/my-day-view";
import { createSchedulePopup } from "../ui/views/my-day/schedule-popup";
import { createNextActionFilterStore } from "../ui/views/next-action/next-action-filter-store";
import { createNextActionView } from "../ui/views/next-action/next-action-view";
import { createOpenProjectStore } from "../ui/views/projects/open-project-store";
import { createProjectGroupsStore } from "../ui/views/projects/project-groups-store";
import { createProjectsView } from "../ui/views/projects/projects-view";
import { createReviewPageStore } from "../ui/views/review/review-page-store";
import { createReviewView } from "../ui/views/review/review-view";
import { createStatsScaleStore } from "../ui/views/stats/stats-scale-store";
import { createStatsView } from "../ui/views/stats/stats-view";
import type { FeatureModule } from "./bootstrap";
import { createPanelPlacement } from "./panel-placement";

/** The plugin panel's type for the load of `pluginName`. */
export function pluginPanelType(pluginName: string): string {
  return `${pluginName}.panel`;
}

/**
 * The plugin panel (#36): the editor sidetool button, the panel type and its
 * style sheet, with the next action view (#53), the My Day view (#83), the
 * inbox view (#37), the all tasks view (#65), the projects view (#155), the review view (#98, #99), the stats view (#132) and their
 * card actions (#39). `views`
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
  /** A change of the day boundary setting, for the My Day view (#81). */
  dayBoundaryChanges: ChangeSignalSource;
  /** The start preview days, for how far ahead the next actions look. */
  startPreviewDays: StartPreviewDaysSetting;
  /** The cards' status change, "open in notes" and notices (#39). */
  taskActions: TaskActionsDeps;
  /** The current load's task menu registrations, for a right-click on a card. */
  menuItems: () => TaskMenuItems | undefined;
  /** The current load's project menu registrations, for the project rows. */
  projectMenuItems: () => ProjectMenuItems | undefined;
  /**
   * The task panel (#40, #42): the selected task shows in the side pane in
   * the wide tier and in the popup otherwise.
   */
  taskPanel: { openPopup: OpenTaskPanelPopup; formDeps: TaskPanelFormDeps };
  /** The review popup (#103), for the review view's "Change review interval". */
  openReviewPopup: OpenReviewPopup;
  /**
   * The quick capture popup, for the review's "Create task" (#99), its
   * 所属项目 filled in from the projects step's rows (#162).
   */
  openQuickCapture: OpenQuickCapture;
  /** The block the panel's hidden editor shows: the task tag block. */
  editorHost: EditorHost;
}): { feature: FeatureModule; views: PanelViews } {
  const { repository, changes, taskPanel } = deps;
  const views = createPanelViews();
  // The next action view's filter (#55): in memory only, so it outlives the
  // plugin panel closing and is gone with the load (cleared on release).
  const nextActionFilter = createNextActionFilterStore();
  // The all tasks view's collapsed nodes (#67), sort (#68), done section
  // (#66), filter and search text (#69): in memory only, likewise, apart
  // from the next action view's filter.
  const allTasks = createTaskTreeStores();
  // The project list's collapsed groups (#155): in memory only, likewise.
  const projectGroups = createProjectGroupsStore();
  // The project open in the projects view (#156): in memory only, likewise.
  const openProject = createOpenProjectStore();
  // The project details' tree state (#157): in memory only, apart from the
  // all tasks view's stores.
  const projectDetails = createTaskTreeStores();
  // The review view's page (#98): in memory only, likewise.
  const reviewPage = createReviewPageStore();
  // The review's projects step's collapsed groups (#161): in memory only,
  // apart from the project list's.
  const reviewProjectGroups = createProjectGroupsStore();
  // The stats view's scale (#135): in memory only, likewise.
  const statsScale = createStatsScaleStore();
  // When the last full review was completed (#101), in `plugins.setData`
  // under the current load's name.
  let loadedPluginName: string | undefined;
  const lastFullReview = createPluginDataLastFullReview(() => loadedPluginName);
  const readCandidates = createReadCandidates({ repository });
  // Every view's cards drag into the notes (#123, #127).
  const linkTaskInNote = createLinkTaskInNote({ repository });
  views.register(
    createNextActionView({
      readNextActions: createReadNextActions({
        repository,
        clock: systemClock,
        dayBoundary: deps.dayBoundary,
        startPreviewDays: deps.startPreviewDays,
      }),
      linkTaskInNote,
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
  const scheduleDeps = {
    scheduleInMyDay: createScheduleInMyDay(myDayDeps),
    unscheduleInMyDay: createUnscheduleInMyDay(myDayDeps),
    notify: deps.taskActions.notify,
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
      linkTaskInNote,
      today: deps.today,
      now: () => systemClock.now(),
      changes,
      dayBoundaryChanges: deps.dayBoundaryChanges,
      taskActions: deps.taskActions,
      menuItems: deps.menuItems,
      openSchedulePopup: createSchedulePopup({
        deps: scheduleDeps,
        // Into the load's root; nothing outside a load.
        render: (node) => renderSchedulePopup(node),
      }),
      // Dragging on the timeline (#85) writes as the popup does.
      scheduleActions: createMyDayScheduleActions(scheduleDeps),
    }),
  );
  views.register(
    createInboxView({
      readInbox: createReadInbox({
        repository,
        clock: systemClock,
        dayBoundary: deps.dayBoundary,
        startPreviewDays: deps.startPreviewDays,
      }),
      linkTaskInNote,
      today: deps.today,
      changes,
      taskActions: deps.taskActions,
      menuItems: deps.menuItems,
    }),
  );
  // The all tasks view, and the project details with a project scope.
  const readAllTasks = createReadAllTasks({
    repository,
    clock: systemClock,
    dayBoundary: deps.dayBoundary,
    startPreviewDays: deps.startPreviewDays,
  });
  // Moving a block from a tree: the all tasks view's and the project details'.
  const moveTask = createMoveTask({ repository });
  views.register(
    createAllTasksView({
      readAllTasks,
      today: deps.today,
      changes,
      taskActions: deps.taskActions,
      menuItems: deps.menuItems,
      projectMenuItems: deps.projectMenuItems,
      collapse: allTasks.collapse,
      sort: allTasks.sort,
      doneSection: allTasks.doneSection,
      readCandidates,
      filter: allTasks.filter,
      moveTask,
      linkTaskInNote,
    }),
  );
  views.register(
    createProjectsView({
      readProjectList: createReadProjectList({
        repository,
        clock: systemClock,
        dayBoundary: deps.dayBoundary,
        startPreviewDays: deps.startPreviewDays,
      }),
      today: deps.today,
      changes,
      taskActions: deps.taskActions,
      projectMenuItems: deps.projectMenuItems,
      groups: projectGroups,
      readAllTasks,
      openProject,
      menuItems: deps.menuItems,
      readCandidates,
      moveTask,
      readMoveCrossing: createReadMoveCrossing({ repository }),
      linkTaskInNote,
      details: projectDetails,
    }),
  );
  views.register(
    createReviewView({
      readReview: createReadReview({
        ...myDayDeps,
        startPreviewDays: deps.startPreviewDays,
        lastFullReview,
      }),
      completeFullReview: createCompleteFullReview({
        clock: systemClock,
        lastFullReview,
      }),
      markReviewed: createMarkReviewed(myDayDeps),
      canMarkReviewed: createCanMarkReviewed(),
      openReviewPopup: deps.openReviewPopup,
      addToMyDay: createAddToMyDay(myDayDeps),
      dropTask: createDropTask({ repository }),
      editTask: createEditTask({ repository }),
      linkTaskInNote,
      openQuickCapture: deps.openQuickCapture,
      today: deps.today,
      changes,
      taskActions: deps.taskActions,
      menuItems: deps.menuItems,
      page: reviewPage,
      projectMenuItems: deps.projectMenuItems,
      projectGroups: reviewProjectGroups,
      openProject,
    }),
  );
  views.register(
    createStatsView({
      readStats: createReadStats({
        ...myDayDeps,
        startPreviewDays: deps.startPreviewDays,
      }),
      today: deps.today,
      changes,
      scale: statsScale,
      allTasksFilter: allTasks.filter,
      reviewPage,
      linkTaskInNote,
      taskActions: deps.taskActions,
      menuItems: deps.menuItems,
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
    noteCursors: orcaNoteCursorSource,
    // Changes made elsewhere without a hook (e.g. sync) show on return.
    onActivated: refresh,
  });

  const feature: FeatureModule = (context) => {
    const { pluginName, registry } = context;
    loadedPluginName = pluginName;
    registry.add(`${pluginName}.lastFullReviewName`, () => {
      loadedPluginName = undefined;
    });
    // Identifiers share one namespace across kinds: the style sheet must not
    // be named like the panel type.
    // Each load is a new module instance already (plugin-lifecycle-settings);
    // clearing on release also covers a load → unload → load in one instance.
    registry.add(`${pluginName}.nextActionFilter`, nextActionFilter.clear);
    registry.add(`${pluginName}.allTasksStores`, allTasks.clear);
    registry.add(`${pluginName}.projectGroups`, projectGroups.clear);
    registry.add(`${pluginName}.openProject`, openProject.clear);
    registry.add(`${pluginName}.projectDetailsStores`, projectDetails.clear);
    registry.add(`${pluginName}.reviewPage`, reviewPage.clear);
    registry.add(
      `${pluginName}.reviewProjectGroups`,
      reviewProjectGroups.clear,
    );
    registry.add(`${pluginName}.statsScale`, statsScale.clear);
    registry.css("panelStyle", panelCss);
    registry.css("componentStyle", componentCss);
    registry.css("taskDragStyle", taskDragCss);
    registry.css("cardDragStyle", cardDragCss);
    // Alt going down or up switches a card drag under way between a
    // reference and a mirror (#126). Capturing, so the notes' editor cannot
    // keep the key from it; nothing is prevented.
    registry.listener(
      window,
      "keydown",
      handleCardDragAltKey as EventListener,
      true,
    );
    registry.listener(
      window,
      "keyup",
      handleCardDragAltKey as EventListener,
      true,
    );
    registry.css("myDayStyle", myDayCss);
    registry.css("statsStyle", statsCss);
    registry.css("statsPeriodStyle", statsPeriodCss);
    registry.css("statsNowStyle", statsNowCss);
    registry.css("statsDistributionStyle", statsDistributionCss);
    registry.css("statsSelectionStyle", statsSelectionCss);
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
