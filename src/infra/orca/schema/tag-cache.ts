// This repo's cache of a plugin tag, kept in `plugins.setData` under the tag's
// own key (ADR 0002). Discardable: anything unreadable counts as no cache.
// `setData` is already per repo (plugin-lifecycle-settings spike), so the key
// carries no repo name.
import { describeError } from "../../../shared/describe-error";

/** What this repo remembers about the tag it last used (ADR 0002). */
export interface TagCache {
  tagBlockId: number;
  tagName: string;
}

function parseCache(raw: unknown): TagCache | undefined {
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

export async function readTagCache(
  pluginName: string,
  cacheKey: string,
): Promise<TagCache | undefined> {
  try {
    return parseCache(await orca.plugins.getData(pluginName, cacheKey));
  } catch (error) {
    // Without a cache the tag goes through the stricter first-takeover check.
    console.warn(
      `[${pluginName}] could not read the cache "${cacheKey}"`,
      error,
    );
    return undefined;
  }
}

/** Records the tag in use; skips the write when nothing changed. */
export async function writeTagCache(
  pluginName: string,
  cacheKey: string,
  previous: TagCache | undefined,
  next: TagCache,
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
      `[${pluginName}] could not write the cache "${cacheKey}": ${describeError(error)}`,
    );
  }
}
