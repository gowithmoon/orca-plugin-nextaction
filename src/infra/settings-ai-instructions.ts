// AiInstructionsSetting on the plugin settings. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { AiInstructionsSetting } from "../application/ports/ai-instructions-setting";

/** A block ID alone, or in a block reference: "123" or "((123))". */
const blockIdPattern = /^(?:(\d+)|\(\((\d+)\)\))$/;

/**
 * Reads the `string` setting through `read` on every call: a block ID, or a
 * block reference to one, with any spaces around it; anything else (or no
 * value) names no block (#203).
 */
export function createSettingsAiInstructions(
  read: () => unknown,
): AiInstructionsSetting {
  return {
    current() {
      const value = read();
      if (typeof value !== "string") return null;
      const match = blockIdPattern.exec(value.trim());
      const digits = match?.[1] ?? match?.[2];
      if (digits === undefined) return null;
      const id = Number(digits);
      return id > 0 ? id : null;
    },
  };
}
