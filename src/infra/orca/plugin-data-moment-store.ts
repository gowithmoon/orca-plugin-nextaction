// One moment kept on `plugins.setData` (ADR 0001: discardable, not task
// data). `setData` is already per repo (plugin-lifecycle-settings spike), so
// the key carries no repo name. Kept as an ISO 8601 string; anything else,
// or a failed read, counts as no moment. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import { describeError } from "../../shared/describe-error";
import { OrcaError } from "./orca-error";

/** A moment that can be read back, `null` when there is none. */
export interface PluginDataMomentStore {
  read(): Promise<Date | null>;
  write(at: Date): Promise<void>;
}

function parseMoment(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * The moment under `dataKey` for the load of `pluginName()`; `undefined`
 * while not loaded, when it reads as no moment and refuses to write.
 * `label` names the moment in warnings and errors (e.g. "the full review").
 */
export function createPluginDataMoment(
  pluginName: () => string | undefined,
  dataKey: string,
  label: string,
): PluginDataMomentStore {
  return {
    async read() {
      const name = pluginName();
      if (name === undefined) return null;
      try {
        return parseMoment(await orca.plugins.getData(name, dataKey));
      } catch (error) {
        // Discardable: a failed read is no moment.
        console.warn(`[${name}] could not read ${label}`, error);
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
          `could not record ${label}: ${describeError(error)}`,
        );
      }
    },
  };
}
