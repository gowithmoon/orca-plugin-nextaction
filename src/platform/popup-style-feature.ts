import { aiDraftCss } from "../ui/styles/ai-draft-style";
import { taskPanelCss } from "../ui/styles/task-panel-style";
import { typeScaleCss } from "../ui/styles/type-scale-style";
import { windowCss } from "../ui/styles/window-style";
import type { FeatureModule } from "./bootstrap";

/**
 * The style sheets both popups rely on (#45 "两个弹窗共用的窗口外观"): the
 * plugin's type scale, which the plugin panel uses too, the shared window
 * look, the task panel's styles, whose field styles quick capture and
 * "Extract tasks" reuse, and the parts the AI draft windows share.
 * Loaded before the task tag feature (quick capture), the task panel feature
 * and the panel feature, so it is released after them.
 */
export function createPopupStyleFeature(): FeatureModule {
  return ({ registry }) => {
    registry.css("typeScaleStyle", typeScaleCss);
    registry.css("windowStyle", windowCss);
    registry.css("taskPanelStyle", taskPanelCss);
    registry.css("aiDraftStyle", aiDraftCss);
  };
}
