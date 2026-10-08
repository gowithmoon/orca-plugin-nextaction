import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { TaskRepository } from "../application/ports/task-repository";
import { createReadInbox } from "../application/usecases/read-inbox";
import { defaultDayBoundary, logicalDay } from "../domain/time/logical-day";
import { systemClock } from "../infra/system-clock";
import type { ChangeSignal } from "../shared/change-signal";
import { createNextActionPanel } from "../ui/panel/nextaction-panel";
import { createPanelButton } from "../ui/panel/panel-button";
import { createPanelViews, type PanelViews } from "../ui/panel/panel-views";
import { componentCss } from "../ui/styles/component-style";
import { panelCss } from "../ui/styles/panel-style";
import { createInboxView } from "../ui/views/inbox/inbox-view";
import type { FeatureModule } from "./bootstrap";
import { dayBoundaryFrom } from "./day-boundary";
import { createPanelPlacement } from "./panel-placement";
import type { OpenTaskPanel } from "./task-panel-feature";

/** The plugin panel's type: the registry prefixes the name `panel`. */
export function pluginPanelType(pluginName: string): string {
  return `${pluginName}.panel`;
}

/**
 * The plugin panel (#36): the editor sidetool button, the panel type and its
 * style sheet, with the inbox view (#37). `views` is the navigation's
 * registration; later features append their views to it before this feature
 * loads.
 */
export function createPanelFeature(
  repository: TaskRepository,
  /** The task change signal; focus and the refresh button give it at once. */
  changes: ChangeSignal,
  /** A card was clicked (#40): the task panel opens as a popup. */
  openTaskPanel: OpenTaskPanel,
): {
  feature: FeatureModule;
  views: PanelViews;
} {
  // The settings of the current load; the view is created before any load.
  let dayBoundary: DayBoundarySetting = {
    current: () => defaultDayBoundary,
  };
  const views = createPanelViews();
  views.register(
    createInboxView({
      readInbox: createReadInbox({ repository }),
      today: () => logicalDay(systemClock.now(), dayBoundary.current()),
      changes,
      onOpenTask: openTaskPanel,
    }),
  );
  // Created once, so the panel's renderer keeps the same component.
  const refresh = () => changes.now();
  const panelRenderer = createNextActionPanel({
    views,
    onRefresh: refresh,
    // Changes made elsewhere without a hook (e.g. sync) show on return.
    onActivated: refresh,
  });

  const feature: FeatureModule = (context) => {
    const { pluginName, registry } = context;
    dayBoundary = dayBoundaryFrom(context);
    // Identifiers share one namespace across kinds: the style sheet must not
    // be named like the panel type.
    registry.css("panelStyle", panelCss);
    registry.css("componentStyle", componentCss);
    const panelType = pluginPanelType(pluginName);
    const placement = createPanelPlacement(panelType);
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
