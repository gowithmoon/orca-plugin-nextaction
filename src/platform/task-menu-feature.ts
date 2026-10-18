import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { TaskRepository } from "../application/ports/task-repository";
import type { TaskTagNamesSource } from "../application/ports/task-tag-names";
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
import { createNoteStatusMenu } from "../ui/task-menu/note-status-menu";
import { statusIconAt } from "../ui/task-menu/orca-dom";
import { registerSkipMenuItem } from "../ui/task-menu/skip-menu-item";
import { registerSplitMenuItem } from "../ui/task-menu/split-menu-item";
import { registerSubtaskMenuItem } from "../ui/task-menu/subtask-menu-item";
import {
  createTaskBlockMenuCommand,
  createTaskTagMenuCommand,
} from "../ui/task-menu/task-menu";
import { registerTaskPanelMenuItem } from "../ui/task-panel/task-panel-menu-item";
import type { FeatureModule } from "./bootstrap";

/**
 * Puts the task menu (#31) into Orca's own menus: the tag menu of the task
 * tag and the block handle's menu (official-task-menus). `items` is this
 * load's registration, also rendered by the plugin panel's right-click menu
 * (#39); `undefined` outside a load. A click on a status icon in the notes
 * opens the status menu there (#193, status-icon-click): the one place the
 * plugin listens to Orca's mouse events.
 */
export function createTaskMenuFeature(deps: {
  repository: TaskRepository;
  taskTagBlockId: () => number | undefined;
  dayBoundary: DayBoundarySetting;
  /** "Open task panel" (#40): opens the popup; from Orca's menus, always. */
  openTaskPanel: (taskId: TaskId) => void;
  /** "Create subtask" (#190): opens the capture window for the task. */
  openCreateSubtask: (parent: Task) => void;
  /** "Split into subtasks" (#202): opens the AI's draft window for the task. */
  openSplitSubtasks: (parent: Task) => void;
  /** The task tag's name, for finding status icons; none while paused. */
  names: TaskTagNamesSource;
}): { feature: FeatureModule; items: () => TaskMenuItems | undefined } {
  const { repository } = deps;
  let current: TaskMenuItems | undefined;
  const feature: FeatureModule = (context) => {
    const { pluginName, registry } = context;
    const items = createTaskMenuItems();
    const changeStatus = createChangeStatus({
      repository,
      clock: systemClock,
      dayBoundary: deps.dayBoundary,
    });
    registerBuiltinTaskMenuItems(items, {
      changeStatus,
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
    registerSplitMenuItem(items, deps.openSplitSubtasks);
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

    // The status menu at a clicked status icon. Its layer wears the plugin
    // panel's popup layer style (panel-style.ts, injected by the panel
    // feature). The root comes first, so it is released after the listeners.
    const statusMenuRoot = registry.reactRoot("noteStatusMenu", null);
    const openStatusMenu = createNoteStatusMenu({
      readTask: menuDeps.readTask,
      changeStatus,
      pluginName,
      render: statusMenuRoot.render,
    });
    const hitOf = (event: Event) => {
      const tagName = deps.names.current()?.tagName;
      if (!tagName || !(event instanceof MouseEvent) || event.button !== 0) {
        return undefined;
      }
      return statusIconAt(event, tagName);
    };
    // In the capture phase on window, every step of a press on the icon is
    // kept from Orca, so the caret stays where it was; the click opens the
    // menu (status-icon-click). Elsewhere nothing is touched.
    for (const type of [
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click",
    ]) {
      registry.listener(
        window,
        type,
        (event) => {
          const hit = hitOf(event);
          if (!hit) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          if (type === "click") void openStatusMenu(hit);
        },
        true,
      );
    }
  };
  return { feature, items: () => current };
}
