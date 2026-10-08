import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { TaskRepository } from "../application/ports/task-repository";
import { createChangeStatus } from "../application/usecases/change-status";
import { createReadInbox } from "../application/usecases/read-inbox";
import { defaultDayBoundary, logicalDay } from "../domain/time/logical-day";
import { systemClock } from "../infra/system-clock";
import type { ChangeSignal } from "../shared/change-signal";
import type { TaskActionsDeps } from "../ui/hooks/use-task-actions";
import { createNotify } from "../ui/notify";
import { createNextActionPanel } from "../ui/panel/nextaction-panel";
import type { OpenInNotes } from "../ui/panel/open-in-notes";
import { createPanelButton } from "../ui/panel/panel-button";
import { createPanelViews, type PanelViews } from "../ui/panel/panel-views";
import { componentCss } from "../ui/styles/component-style";
import { panelCss } from "../ui/styles/panel-style";
import type { TaskMenuItems } from "../ui/task-menu/menu-items";
import type { TaskPanelFormDeps } from "../ui/task-panel/task-panel-form";
import type { OpenTaskPanelPopup } from "../ui/task-panel/task-panel-popup";
import { createTaskPanelSidePane } from "../ui/task-panel/task-panel-side-pane";
import { createInboxView } from "../ui/views/inbox/inbox-view";
import type { FeatureModule } from "./bootstrap";
import { dayBoundaryFrom } from "./day-boundary";
import { createOpenInNotes } from "./open-in-notes";
import { createPanelPlacement } from "./panel-placement";

/**
 * The plugin panel (#36): the editor sidetool button, the panel type and its
 * style sheet, with the inbox view (#37) and its card actions (#39). `views`
 * is the navigation's registration; later features append their views to it
 * before this feature loads. `taskActions` are the current load's status
 * change and "open in notes", for anything else showing a task (e.g. the task
 * panel).
 */
export function createPanelFeature(
  repository: TaskRepository,
  /** The task change signal; focus and the refresh button give it at once. */
  changes: ChangeSignal,
  /** The current load's task menu registrations, for a right-click on a card. */
  menuItems: () => TaskMenuItems | undefined,
  /**
   * The task panel (#40, #42): the selected task shows in the side pane in
   * the wide tier and in the popup otherwise. Read when first needed: the
   * task panel is created after this feature.
   */
  taskPanel: () => {
    openPopup: OpenTaskPanelPopup;
    formDeps: TaskPanelFormDeps;
  },
): {
  feature: FeatureModule;
  views: PanelViews;
  taskActions: TaskActionsDeps;
} {
  // What the current load knows; the views are created before any load.
  let dayBoundary: DayBoundarySetting = {
    current: () => defaultDayBoundary,
  };
  let pluginName = "";
  let openInNotes: OpenInNotes = () => {
    throw new Error("the plugin is not loaded");
  };
  const taskActions: TaskActionsDeps = {
    changeStatus: createChangeStatus({
      repository,
      clock: systemClock,
      dayBoundary: { current: () => dayBoundary.current() },
    }),
    openInNotes: (blockId, from) => openInNotes(blockId, from),
    notify: (type, message) => createNotify(pluginName)(type, message),
  };
  const views = createPanelViews();
  views.register(
    createInboxView({
      readInbox: createReadInbox({ repository }),
      today: () => logicalDay(systemClock.now(), dayBoundary.current()),
      changes,
      taskActions,
      menuItems,
    }),
  );
  // Created once, so the panel's renderer keeps the same component.
  const refresh = () => changes.now();
  const panelRenderer = createNextActionPanel({
    views,
    sidePane: createTaskPanelSidePane(() => taskPanel().formDeps),
    openPopup: (taskId, onClose) => taskPanel().openPopup(taskId, onClose),
    onRefresh: refresh,
    // Changes made elsewhere without a hook (e.g. sync) show on return.
    onActivated: refresh,
  });

  const feature: FeatureModule = (context) => {
    const { registry } = context;
    pluginName = context.pluginName;
    dayBoundary = dayBoundaryFrom(context);
    // Identifiers share one namespace across kinds: the style sheet must not
    // be named like the panel type.
    registry.css("panelStyle", panelCss);
    registry.css("componentStyle", componentCss);
    const panelType = `${pluginName}.panel`;
    const placement = createPanelPlacement(panelType);
    openInNotes = createOpenInNotes(panelType);
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
  return { feature, views, taskActions };
}
