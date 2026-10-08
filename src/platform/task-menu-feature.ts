import type { TaskRepository } from "../application/ports/task-repository";
import { createChangeStatus } from "../application/usecases/change-status";
import { createDropTask } from "../application/usecases/drop-task";
import { createReadTask } from "../application/usecases/read-task";
import { systemClock } from "../infra/system-clock";
import { registerBuiltinTaskMenuItems } from "../ui/task-menu/builtin-items";
import { createTaskMenuItems } from "../ui/task-menu/menu-items";
import {
  createTaskBlockMenuCommand,
  createTaskTagMenuCommand,
} from "../ui/task-menu/task-menu";
import { registerTaskPanelMenuItem } from "../ui/task-panel/task-panel-menu-item";
import type { FeatureModule } from "./bootstrap";
import { dayBoundaryFrom } from "./day-boundary";
import type { OpenTaskPanel } from "./task-panel-feature";

/**
 * Puts the task menu (#31) into Orca's own menus: the tag menu of the task
 * tag and the block handle's menu (official-task-menus). The status icon only
 * displays; nothing listens to Orca's mouse events.
 */
export function createTaskMenuFeature(
  repository: TaskRepository,
  taskTagBlockId: () => number | undefined,
  /** "Open task panel" (#40): from Orca's menus it always opens the popup. */
  openTaskPanel: OpenTaskPanel,
): FeatureModule {
  return (context) => {
    const { pluginName, registry } = context;
    const items = createTaskMenuItems();
    registerBuiltinTaskMenuItems(items, {
      changeStatus: createChangeStatus({
        repository,
        clock: systemClock,
        dayBoundary: dayBoundaryFrom(context),
      }),
      dropTask: createDropTask({ repository }),
      pluginName,
    });
    registerTaskPanelMenuItem(items, (taskId) => openTaskPanel(taskId));

    const deps = {
      items,
      readTask: createReadTask({ repository }),
      pluginName,
      taskTagBlockId,
    };
    registry.tagMenuCommand("taskMenu.tag", createTaskTagMenuCommand(deps));
    registry.blockMenuCommand(
      "taskMenu.block",
      createTaskBlockMenuCommand(deps),
    );
  };
}
