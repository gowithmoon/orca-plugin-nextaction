import type { ProjectTagNamesSource } from "../application/ports/project-tag-names";
import type { TaskTagNamesSource } from "../application/ports/task-tag-names";
import { projectStatusIconCss } from "../ui/project-menu/project-status-icon-style";
import { statusIconCss } from "../ui/task-menu/status-icon-style";
import type { FeatureModule } from "./bootstrap";

/**
 * Draws a status icon before every task block (#30), and a project status
 * icon before every project block (#144). Each style sheet is rebuilt
 * whenever its tag's names change (rename, startup alignment, invalidated
 * properties) and removed while that tag is paused. The project one also
 * follows the task tag: a block with both shows the task's icon.
 */
export function createStatusIconFeature(
  names: TaskTagNamesSource,
  projectNames: ProjectTagNamesSource,
): FeatureModule {
  return ({ pluginName, registry }) => {
    const style = registry.replaceableCss("statusIcons");
    const projectStyle = registry.replaceableCss("projectStatusIcons");
    const apply = () => {
      const current = names.current();
      style.set(current ? statusIconCss(current) : undefined);
      const project = projectNames.current();
      projectStyle.set(
        project ? projectStatusIconCss(project, current?.tagName) : undefined,
      );
    };
    // Registered after the style sheets, so they are released before them.
    registry.add(
      `${pluginName}.statusIcons.subscription`,
      names.subscribe(apply),
    );
    registry.add(
      `${pluginName}.projectStatusIcons.subscription`,
      projectNames.subscribe(apply),
    );
    apply();
  };
}
