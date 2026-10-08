import type { TaskRepository } from "../application/ports/task-repository";
import type { TaskTagNamesSource } from "../application/ports/task-tag-names";
import { createChangeStatus } from "../application/usecases/change-status";
import { createDropTask } from "../application/usecases/drop-task";
import { createReadTask } from "../application/usecases/read-task";
import { registerBuiltinTaskMenuItems } from "../ui/task-menu/builtin-items";
import { createTaskMenuItems } from "../ui/task-menu/menu-items";
import { statusIconAt } from "../ui/task-menu/orca-dom";
import { createTaskMenuController } from "../ui/task-menu/task-menu";
import type { FeatureModule } from "./bootstrap";

/**
 * Opens the task menu when a status icon is clicked (#31). Listens in the
 * capture phase so that a hit never reaches Orca: the cursor stays where it
 * was (status-icon-task-menu). Nothing is hit while task features are paused,
 * as no icons are drawn then.
 */
export function createTaskMenuFeature(
  repository: TaskRepository,
  names: TaskTagNamesSource,
): FeatureModule {
  return ({ pluginName, registry }) => {
    const notify = (type: "info" | "warn" | "error", message: string) =>
      orca.notify(type, message, { title: pluginName });

    const items = createTaskMenuItems();
    registerBuiltinTaskMenuItems(items, {
      changeStatus: createChangeStatus({ repository }),
      dropTask: createDropTask({ repository }),
      notify,
    });

    const root = registry.reactRoot("taskMenu", null);
    const open = createTaskMenuController({
      items,
      readTask: createReadTask({ repository }),
      notify,
      render: root.render,
    });

    const hitOf = (event: Event) => {
      const tagName = names.current()?.tagName;
      if (!tagName || !(event instanceof MouseEvent) || event.button !== 0) {
        return undefined;
      }
      return statusIconAt(event, tagName);
    };
    const swallow = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    registry.listener(
      document,
      "mousedown",
      (event) => {
        if (hitOf(event)) swallow(event);
      },
      true,
    );
    registry.listener(
      document,
      "click",
      (event) => {
        const hit = hitOf(event);
        if (!hit) return;
        swallow(event);
        void open(hit);
      },
      true,
    );
  };
}
