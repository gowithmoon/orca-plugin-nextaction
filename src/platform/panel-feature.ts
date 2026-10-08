import { createNextActionPanel } from "../ui/panel/nextaction-panel";
import { createPanelButton } from "../ui/panel/panel-button";
import { createPanelViews, type PanelViews } from "../ui/panel/panel-views";
import { panelCss } from "../ui/styles/panel-style";
import { inboxView } from "../ui/views/inbox/inbox-view";
import type { FeatureModule } from "./bootstrap";
import { createPanelPlacement } from "./panel-placement";

/**
 * The plugin panel (#36): the editor sidetool button, the panel type and its
 * style sheet. `views` is the navigation's registration; later features
 * append their views to it before this feature loads.
 */
export function createPanelFeature(): {
  feature: FeatureModule;
  views: PanelViews;
} {
  const views = createPanelViews();
  views.register(inboxView);

  const feature: FeatureModule = ({ pluginName, registry }) => {
    // Identifiers share one namespace across kinds: the style sheet must not
    // be named like the panel type.
    registry.css("panelStyle", panelCss);
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
