import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { TaskRepository } from "../application/ports/task-repository";
import { createAddToMyDay } from "../application/usecases/add-to-my-day";
import { createChangeStatus } from "../application/usecases/change-status";
import { createDropTask } from "../application/usecases/drop-task";
import {
  createCanMarkReviewed,
  createMarkReviewed,
} from "../application/usecases/mark-reviewed";
import { createReadMyDayStatus } from "../application/usecases/read-my-day-status";
import { createReadTask } from "../application/usecases/read-task";
import { createRemoveFromMyDay } from "../application/usecases/remove-from-my-day";
import {
  createCanSkipOccurrence,
  createSkipOccurrence,
} from "../application/usecases/skip-occurrence";
import type { Task, TaskId } from "../domain/task/task";
import { systemClock } from "../infra/system-clock";
import { registerBuiltinTaskMenuItems } from "../ui/task-menu/builtin-items";
import { registerMarkReviewedMenuItem } from "../ui/task-menu/mark-reviewed-menu-item";
import {
  createTaskMenuItems,
  type TaskMenuItems,
} from "../ui/task-menu/menu-items";
import { registerMyDayMenuItem } from "../ui/task-menu/my-day-menu-item";
import { registerSkipMenuItem } from "../ui/task-menu/skip-menu-item";
import { registerSubtaskMenuItem } from "../ui/task-menu/subtask-menu-item";
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
  /** "Create subtask" (#190): opens the capture window for the task. */
  openCreateSubtask: (parent: Task) => void;
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
    const myDayDeps = {
      repository,
      clock: systemClock,
      dayBoundary: deps.dayBoundary,
    };
    registerMyDayMenuItem(items, {
      readMyDayStatus: createReadMyDayStatus(myDayDeps),
      addToMyDay: createAddToMyDay(myDayDeps),
      removeFromMyDay: createRemoveFromMyDay(myDayDeps),
      pluginName,
    });
    registerSkipMenuItem(items, {
      canSkipOccurrence: createCanSkipOccurrence(myDayDeps),
      skipOccurrence: createSkipOccurrence(myDayDeps),
      pluginName,
    });
    registerMarkReviewedMenuItem(items, {
      canMarkReviewed: createCanMarkReviewed(),
      markReviewed: createMarkReviewed(myDayDeps),
      pluginName,
    });
    registerSubtaskMenuItem(items, deps.openCreateSubtask);
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
