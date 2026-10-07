import { defaultTagNames, type NoteLanguage } from "../codec/names";
import type { TaskTagCache } from "./task-tag-cache";

/**
 * The task tag name to look for at startup. A missing or blank setting is not
 * a new name (ADR 0002): it falls back to the name last used in this repo, or
 * on a first start to the default for the interface language. The caller
 * writes the result back into the settings.
 */
export function resolveTagName(
  setting: unknown,
  uiLanguage: NoteLanguage,
  cache?: TaskTagCache,
): string {
  const name = typeof setting === "string" ? setting.trim() : "";
  if (name !== "") return name;
  return cache?.tagName ?? defaultTagNames[uiLanguage];
}
