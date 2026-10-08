import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { TaskRepository } from "../application/ports/task-repository";
import { createDropTask } from "../application/usecases/drop-task";
import { createEditTask } from "../application/usecases/edit-task";
import { createReadCandidates } from "../application/usecases/read-candidates";
import { createReadTask } from "../application/usecases/read-task";
import { defaultDayBoundary, logicalDay } from "../domain/time/logical-day";
import { systemClock } from "../infra/system-clock";
import type { ChangeSignalSource } from "../shared/change-signal";
import type { TaskActionsDeps } from "../ui/hooks/use-task-actions";
import { taskPanelCss } from "../ui/styles/task-panel-style";
import type { TaskPanelFormDeps } from "../ui/task-panel/task-panel-form";
import {
  createTaskPanelPopup,
  type OpenTaskPanelPopup,
} from "../ui/task-panel/task-panel-popup";
import type { FeatureModule } from "./bootstrap";
import { dayBoundaryFrom } from "./day-boundary";

/**
 * The task panel (#40, #42): the popup's style sheet and its own React root,
 * unmounted on unload. `open` is what the task menu and the plugin panel call
 * for the popup; it may be handed out before the feature loads and does
 * nothing outside a load. `formDeps` is what the form needs wherever it shows
 * (the popup, the plugin panel's side pane).
 */
export function createTaskPanelFeature(
  repository: TaskRepository,
  /** Tasks may have changed: an open task panel reads its task again. */
  changes: ChangeSignalSource,
  /** The plugin panel's status change, "open in notes" and notices (#39). */
  actions: TaskActionsDeps,
): {
  feature: FeatureModule;
  open: OpenTaskPanelPopup;
  formDeps: TaskPanelFormDeps;
} {
  // What the current load knows; the form's deps are created before any load.
  let dayBoundary: DayBoundarySetting = {
    current: () => defaultDayBoundary,
  };
  const formDeps: TaskPanelFormDeps = {
    readTask: createReadTask({ repository }),
    editTask: createEditTask({ repository }),
    dropTask: createDropTask({ repository }),
    readCandidates: createReadCandidates({ repository }),
    actions,
    changes,
    today: () => logicalDay(systemClock.now(), dayBoundary.current()),
  };
  let current: OpenTaskPanelPopup | undefined;

  const feature: FeatureModule = (context) => {
    const { pluginName, registry } = context;
    dayBoundary = dayBoundaryFrom(context);
    registry.css("taskPanelStyle", taskPanelCss);
    const root = registry.reactRoot("taskPanelPopup", null);
    let live = true;
    const open = createTaskPanelPopup({
      deps: formDeps,
      // A plugin panel closing late (after unload) still takes its popup
      // away: nothing renders into a root that is gone.
      render: (node) => {
        if (live) root.render(node);
      },
    });
    current = open;
    // Recorded after the root, so it is released first: nothing opens a
    // popup into a root that is going away.
    registry.add(`${pluginName}.taskPanelOpen`, () => {
      live = false;
      if (current === open) current = undefined;
    });
  };

  return {
    feature,
    open: (taskId, onClose) => current?.(taskId, onClose) ?? (() => {}),
    formDeps,
  };
}
