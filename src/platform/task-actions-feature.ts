import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { TaskRepository } from "../application/ports/task-repository";
import { createChangeStatus } from "../application/usecases/change-status";
import { systemClock } from "../infra/system-clock";
import type { TaskActionsDeps } from "../ui/hooks/use-task-actions";
import { createNotify } from "../ui/notify";
import type { OpenInNotes } from "../ui/panel/open-in-notes";
import type { FeatureModule } from "./bootstrap";
import { createOpenInNotes } from "./note-navigation";
import { pluginPanelType } from "./panel-feature";

/**
 * The task actions shared by the task card (#39) and the task panel: status
 * change, "open in notes" and notices. Created before any load; "open in
 * notes" and the notices' title follow the current load.
 */
export function createTaskActionsFeature(
  repository: TaskRepository,
  dayBoundary: DayBoundarySetting,
): { feature: FeatureModule; taskActions: TaskActionsDeps } {
  let pluginName = "";
  let openInNotes: OpenInNotes = () => {
    throw new Error("the plugin is not loaded");
  };
  const taskActions: TaskActionsDeps = {
    changeStatus: createChangeStatus({
      repository,
      clock: systemClock,
      dayBoundary,
    }),
    openInNotes: (blockId, from) => openInNotes(blockId, from),
    notify: (type, message) => createNotify(pluginName)(type, message),
  };
  const feature: FeatureModule = (context) => {
    pluginName = context.pluginName;
    openInNotes = createOpenInNotes(pluginPanelType(pluginName));
  };
  return { feature, taskActions };
}
