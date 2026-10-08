import type { TaskTagNamesSource } from "../application/ports/task-tag-names";
import { statusIconCss } from "../ui/task-menu/status-icon-style";
import type { FeatureModule } from "./bootstrap";

/**
 * Draws a status icon before every task block (#30). The style sheet is
 * rebuilt whenever the task tag names change (rename, startup alignment,
 * invalidated properties) and removed while task features are paused.
 */
export function createStatusIconFeature(
  names: TaskTagNamesSource,
): FeatureModule {
  return ({ pluginName, registry }) => {
    const style = registry.replaceableCss("statusIcons");
    const apply = () => {
      const current = names.current();
      style.set(current ? statusIconCss(current) : undefined);
    };
    // Registered after the style sheet, so it is released before it.
    registry.add(
      `${pluginName}.statusIcons.subscription`,
      names.subscribe(apply),
    );
    apply();
  };
}
