/**
 * The block the user named for their AI instructions (GLOSSARY: AI 说明,
 * #203), `null` when the setting names none. Read on every use, so a change
 * in the settings applies to the next AI request.
 */
export interface AiInstructionsSetting {
  current(): number | null;
}
