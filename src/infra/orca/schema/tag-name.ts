import type { NoteLanguage } from "../codec/names";
import type { TagCache } from "./tag-cache";
import type { TagSchema } from "./tag-schema";

/**
 * The tag name to look for at startup. A missing or blank setting is not a
 * new name (ADR 0002): it falls back to the name last used in this repo, or on
 * a first start to the tag's default for the interface language. The caller
 * writes the result back into the settings.
 */
export function resolveTagName(
  schema: Pick<TagSchema<string>, "defaultNames">,
  setting: unknown,
  uiLanguage: NoteLanguage,
  cache?: TagCache,
): string {
  const name = typeof setting === "string" ? setting.trim() : "";
  if (name !== "") return name;
  return cache?.tagName ?? schema.defaultNames[uiLanguage];
}
