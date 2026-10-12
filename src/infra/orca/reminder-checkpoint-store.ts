// ReminderCheckpointStore on `plugins.setData` (plugin-data-moment-store).
// Without it checking starts from now.
import type { ReminderCheckpointStore } from "../../application/ports/reminder-checkpoint";
import { createPluginDataMoment } from "./plugin-data-moment-store";

/**
 * The store for the load of `pluginName()`; `undefined` while not loaded,
 * when it reads as no moment and refuses to write.
 */
export function createPluginDataReminderCheckpoint(
  pluginName: () => string | undefined,
): ReminderCheckpointStore {
  return createPluginDataMoment(
    pluginName,
    "reminderCheckpoint",
    "the reminder checkpoint",
  );
}
