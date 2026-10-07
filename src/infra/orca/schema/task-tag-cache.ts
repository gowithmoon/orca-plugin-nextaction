// This repo's cache of the task tag, kept in `plugins.setData` (ADR 0002).
// Discardable: anything unreadable counts as no cache. `setData` is already
// per repo (plugin-lifecycle-settings spike), so the key carries no repo name.
import { describeError } from "../../../shared/describe-error";
import type { TaskTagCache } from "./startup-plan";

const cacheKey = "taskTag";

function parseCache(raw: unknown): TaskTagCache | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return undefined;
    const { tagBlockId, tagName } = value as Record<string, unknown>;
    return typeof tagBlockId === "number" && typeof tagName === "string"
      ? { tagBlockId, tagName }
      : undefined;
  } catch {
    // Not JSON: a cache from some other version; discard it.
    return undefined;
  }
}

export async function readTaskTagCache(
  pluginName: string,
): Promise<TaskTagCache | undefined> {
  try {
    return parseCache(await orca.plugins.getData(pluginName, cacheKey));
  } catch (error) {
    // Without a cache the tag goes through the stricter first-takeover check.
    console.warn(`[${pluginName}] could not read the task tag cache`, error);
    return undefined;
  }
}

/** Records the tag in use; skips the write when nothing changed. */
export async function writeTaskTagCache(
  pluginName: string,
  previous: TaskTagCache | undefined,
  next: TaskTagCache,
): Promise<void> {
  if (
    previous?.tagBlockId === next.tagBlockId &&
    previous.tagName === next.tagName
  ) {
    return;
  }
  try {
    await orca.plugins.setData(pluginName, cacheKey, JSON.stringify(next));
  } catch (error) {
    // The cache is discardable; losing it only means a stricter check later.
    console.warn(
      `[${pluginName}] could not write the task tag cache: ${describeError(error)}`,
    );
  }
}
