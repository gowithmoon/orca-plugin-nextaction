import { taskPanelCss } from "../ui/styles/task-panel-style";
import { windowCss } from "../ui/styles/window-style";
import type { FeatureModule } from "./bootstrap";

/**
 * The style sheets both popups rely on (#45 "两个弹窗共用的窗口外观"): the
 * shared window look, and the task panel's styles, whose field styles quick
 * capture reuses. Loaded before the task tag feature (quick capture) and the
 * task panel feature, so it is released after both.
 */
export function createPopupStyleFeature(): FeatureModule {
  return ({ registry }) => {
    registry.css("windowStyle", windowCss);
    registry.css("taskPanelStyle", taskPanelCss);
  };
}
