import type { TaskRepository } from "../application/ports/task-repository";
import { createChangeProjectStatus } from "../application/usecases/change-project-status";
import {
  createDropProject,
  createReadDropProjectPlan,
} from "../application/usecases/drop-project";
import { createReadProject } from "../application/usecases/read-project";
import {
  registerBuiltinProjectMenuItems,
  registerDropProjectItem,
  registerProjectPanelItem,
} from "../ui/project-menu/builtin-items";
import {
  createProjectMenuItems,
  type ProjectMenuItems,
} from "../ui/project-menu/menu-items";
import { createProjectTagMenuCommand } from "../ui/project-menu/project-menu";
import type { FeatureModule } from "./bootstrap";

/**
 * Puts the project menu (#144) into Orca's tag menu of the project tag; the
 * block handle's menu gets no project items. `items` is this load's
 * registration, for the project row (#147) to render and Drop project (#150)
 * to append to; `undefined` outside a load.
 */
export function createProjectMenuFeature(deps: {
  repository: TaskRepository;
  projectTagBlockId: () => number | undefined;
  /** Opens the project panel (#232). */
  openProjectPanel: (projectId: number) => void;
}): { feature: FeatureModule; items: () => ProjectMenuItems | undefined } {
  const { repository } = deps;
  let current: ProjectMenuItems | undefined;
  const feature: FeatureModule = ({ pluginName, registry }) => {
    const items = createProjectMenuItems();
    registerBuiltinProjectMenuItems(items, {
      changeProjectStatus: createChangeProjectStatus({ repository }),
      pluginName,
    });
    registerProjectPanelItem(items, deps.openProjectPanel);
    registerDropProjectItem(items, {
      readDropProjectPlan: createReadDropProjectPlan({ repository }),
      dropProject: createDropProject({ repository }),
      pluginName,
    });
    // Each load replaces the previous load's registration; released last,
    // after the menu command that renders it.
    current = items;
    registry.add(`${pluginName}.projectMenuItems`, () => {
      if (current === items) current = undefined;
    });
    registry.tagMenuCommand(
      "projectMenu.tag",
      createProjectTagMenuCommand({
        items,
        readProject: createReadProject({ repository }),
        pluginName,
        projectTagBlockId: deps.projectTagBlockId,
      }),
    );
  };
  return { feature, items: () => current };
}
