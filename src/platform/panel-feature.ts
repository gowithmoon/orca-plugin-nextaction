import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { TaskRepository } from "../application/ports/task-repository";
import { createReadInbox } from "../application/usecases/read-inbox";
import { defaultDayBoundary, logicalDay } from "../domain/time/logical-day";
import { systemClock } from "../infra/system-clock";
import { createNextActionPanel } from "../ui/panel/nextaction-panel";
import { createPanelButton } from "../ui/panel/panel-button";
import { createPanelViews, type PanelViews } from "../ui/panel/panel-views";
import { componentCss } from "../ui/styles/component-style";
import { panelCss } from "../ui/styles/panel-style";
import { createInboxView } from "../ui/views/inbox/inbox-view";
import type { FeatureModule } from "./bootstrap";
import { dayBoundaryFrom } from "./day-boundary";
import { createPanelPlacement } from "./panel-placement";

/**
 * The plugin panel (#36): the editor sidetool button, the panel type and its
 * style sheet, with the inbox view (#37). `views` is the navigation's
 * registration; later features append their views to it before this feature
 * loads.
 */
export function createPanelFeature(repository: TaskRepository): {
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
    }),
  );

  const feature: FeatureModule = (context) => {
    const { pluginName, registry } = context;
    dayBoundary = dayBoundaryFrom(context);
    // Identifiers share one namespace across kinds: the style sheet must not
    // be named like the panel type.
    registry.css("panelStyle", panelCss);
    registry.css("componentStyle", componentCss);
    const panelType = `${pluginName}.panel`;
    const placement = createPanelPlacement(panelType);
    // Released before the style sheet: open panels are restored or closed
    // first, then the type is unregistered (ADR 0011).
    registry.panel("panel", createNextActionPanel({ views }), {
      closePanel: placement.close,
    });
    registry.editorSidetool(
      "panelButton",
      createPanelButton(placement.toggle, pluginName),
    );
  };
  return { feature, views };
}
