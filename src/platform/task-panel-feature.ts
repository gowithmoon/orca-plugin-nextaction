import type { TaskRepository } from "../application/ports/task-repository";
import { createChangeStatus } from "../application/usecases/change-status";
import { createDropTask } from "../application/usecases/drop-task";
import { createEditTask } from "../application/usecases/edit-task";
import { createReadTask } from "../application/usecases/read-task";
import type { TaskId } from "../domain/task/task";
import { logicalDay } from "../domain/time/logical-day";
import { systemClock } from "../infra/system-clock";
import type { ChangeSignalSource } from "../shared/change-signal";
import { taskPanelCss } from "../ui/styles/task-panel-style";
import {
  createTaskPanelPopup,
  type OpenFrom,
} from "../ui/task-panel/task-panel-popup";
import type { FeatureModule } from "./bootstrap";
import { dayBoundaryFrom } from "./day-boundary";
import { createOpenInNotes } from "./open-in-notes";
import { pluginPanelType } from "./panel-feature";

/** Opens the task panel popup on a task; does nothing outside a load. */
export type OpenTaskPanel = (taskId: TaskId, from?: OpenFrom) => void;

/**
 * The task panel's popup (#40): its style sheet and its own React root,
 * unmounted on unload. `open` is what the task menu and the inbox call; it
 * may be handed out before the feature loads.
 */
export function createTaskPanelFeature(
  repository: TaskRepository,
  /** Tasks may have changed: an open task panel reads its task again. */
  changes: ChangeSignalSource,
): { feature: FeatureModule; open: OpenTaskPanel } {
  let current: OpenTaskPanel | undefined;

  const feature: FeatureModule = (context) => {
    const { pluginName, registry } = context;
    const dayBoundary = dayBoundaryFrom(context);
    registry.css("taskPanelStyle", taskPanelCss);
    const root = registry.reactRoot("taskPanelPopup", null);
    const open = createTaskPanelPopup({
      deps: {
        readTask: createReadTask({ repository }),
        useCases: {
          editTask: createEditTask({ repository }),
          changeStatus: createChangeStatus({
            repository,
            clock: systemClock,
            dayBoundary,
          }),
          dropTask: createDropTask({ repository }),
        },
        changes,
        pluginName,
        today: () => logicalDay(systemClock.now(), dayBoundary.current()),
      },
      render: root.render,
      openInNotes: createOpenInNotes(pluginPanelType(pluginName)),
    });
    current = open;
    // Recorded after the root, so it is released first: nothing opens a
    // popup into a root that is going away.
    registry.add(`${pluginName}.taskPanelOpen`, () => {
      if (current === open) current = undefined;
    });
  };

  return {
    feature,
    open: (taskId, from) => current?.(taskId, from),
  };
}
