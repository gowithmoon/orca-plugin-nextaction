// ReminderCheckpointStore on `plugins.setData` (ADR 0001: discardable, not
// task data). `setData` is already per repo (plugin-lifecycle-settings
// spike), so the key carries no repo name. Kept as an ISO 8601 string;
// anything else, or a failed read, counts as no moment. Verified by hand in
// Orca (docs/ARCHITECTURE.md §5).
import type { ReminderCheckpointStore } from "../../application/ports/reminder-checkpoint";
import { describeError } from "../../shared/describe-error";
import { OrcaError } from "./orca-error";

const dataKey = "reminderCheckpoint";

function parseMoment(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * The store for the load of `pluginName()`; `undefined` while not loaded,
 * when it reads as no moment and refuses to write.
 */
export function createPluginDataReminderCheckpoint(
  pluginName: () => string | undefined,
): ReminderCheckpointStore {
  return {
    async read() {
      const name = pluginName();
      if (name === undefined) return null;
      try {
        return parseMoment(await orca.plugins.getData(name, dataKey));
      } catch (error) {
        // Discardable: without it checking starts from now.
        console.warn(`[${name}] could not read the reminder checkpoint`, error);
        return null;
      }
    },
    async write(at) {
      const name = pluginName();
      if (name === undefined) {
        throw new OrcaError("the plugin is not loaded");
      }
      try {
        await orca.plugins.setData(name, dataKey, at.toISOString());
      } catch (error) {
        throw new OrcaError(
          `could not record the reminder checkpoint: ${describeError(error)}`,
        );
      }
    },
  };
}
