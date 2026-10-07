import { defaultTagNames, type NoteLanguage } from "../codec/names";

/**
 * The task tag name to look for. A missing or blank setting falls back to
 * the default for the interface language. Writing that default back into the
 * settings belongs to #23.
 */
export function resolveTagName(
  setting: unknown,
  uiLanguage: NoteLanguage,
): string {
  const name = typeof setting === "string" ? setting.trim() : "";
  return name === "" ? defaultTagNames[uiLanguage] : name;
}
