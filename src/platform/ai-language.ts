/**
 * The language the AI writes its questions and explanations in (#201 提示词
 * rule 5): Orca's interface language, as far as the plugin is translated.
 */
export function uiLanguage(): string {
  return orca.state.locale.toLowerCase().startsWith("zh")
    ? "Simplified Chinese"
    : "English";
}
