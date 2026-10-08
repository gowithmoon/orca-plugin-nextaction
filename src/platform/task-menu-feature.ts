import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { TaskRepository } from "../application/ports/task-repository";
import { createChangeStatus } from "../application/usecases/change-status";
import { createDropTask } from "../application/usecases/drop-task";
import { createReadTask } from "../application/usecases/read-task";
import type { TaskId } from "../domain/task/task";
import { systemClock } from "../infra/system-clock";
import { registerBuiltinTaskMenuItems } from "../ui/task-menu/builtin-items";
import {
  createTaskMenuItems,
  type TaskMenuItems,
} from "../ui/task-menu/menu-items";
import {
  createTaskBlockMenuCommand,
  createTaskTagMenuCommand,
} from "../ui/task-menu/task-menu";
import { registerTaskPanelMenuItem } from "../ui/task-panel/task-panel-menu-item";
import type { FeatureModule } from "./bootstrap";

/**
 * Puts the task menu (#31) into Orca's own menus: the tag menu of the task
 * tag and the block handle's menu (official-task-menus). The status icon only
 * displays; nothing listens to Orca's mouse events. `items` is this load's
 * registration, also rendered by the plugin panel's right-click menu (#39);
 * `undefined` outside a load.
 */
export function createTaskMenuFeature(deps: {
  repository: TaskRepository;
  taskTagBlockId: () => number | undefined;
  dayBoundary: DayBoundarySetting;
  /** "Open task panel" (#40): opens the popup; from Orca's menus, always. */
  openTaskPanel: (taskId: TaskId) => void;
}): { feature: FeatureModule; items: () => TaskMenuItems | undefined } {
  const { repository } = deps;
  let current: TaskMenuItems | undefined;
  const feature: FeatureModule = (context) => {
    const { pluginName, registry } = context;
    const items = createTaskMenuItems();
    registerBuiltinTaskMenuItems(items, {
      changeStatus: createChangeStatus({
        repository,
        clock: systemClock,
        dayBoundary: deps.dayBoundary,
      }),
      dropTask: createDropTask({ repository }),
      pluginName,
    });
    registerTaskPanelMenuItem(items, deps.openTaskPanel);

    const menuDeps = {
      items,
      readTask: createReadTask({ repository }),
      pluginName,
      taskTagBlockId: deps.taskTagBlockId,
    };
    // Each load replaces the previous load's registration; released last,
    // after the menu commands that render it.
    current = items;
    registry.add(`${pluginName}.taskMenuItems`, () => {
      if (current === items) current = undefined;
    });
    registry.tagMenuCommand("taskMenu.tag", createTaskTagMenuCommand(menuDeps));
    registry.blockMenuCommand(
      "taskMenu.block",
      createTaskBlockMenuCommand(menuDeps),
    );
  };
  return { feature, items: () => current };
}
