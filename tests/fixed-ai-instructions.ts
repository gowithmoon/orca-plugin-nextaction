// An AiInstructionsSetting for tests: it holds a set block until the test
// changes it.
import type { AiInstructionsSetting } from "../src/application/ports/ai-instructions-setting";

export interface FixedAiInstructions extends AiInstructionsSetting {
  /** Changes the block, as if the user edited the setting. */
  set(blockId: number | null): void;
}

export function createFixedAiInstructions(
  blockId: number | null = null,
): FixedAiInstructions {
  let current = blockId;
  return {
    current: () => current,
    set(next) {
      current = next;
    },
  };
}
