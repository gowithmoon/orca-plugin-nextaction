import type { AiInstructionsSetting } from "../application/ports/ai-instructions-setting";
import { createSettingsAiInstructions } from "../infra/settings-ai-instructions";
import type { FeatureModule } from "./bootstrap";

/**
 * The AI instructions block of the current load (#203), for what is created
 * before any load (use cases): no block until `feature` loads, then read
 * from the settings on every use. Nothing listens for a change: each AI
 * request reads it. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
 */
export function createLoadAiInstructions(): {
  feature: FeatureModule;
  aiInstructions: AiInstructionsSetting;
} {
  let current: AiInstructionsSetting = { current: () => null };
  const aiInstructions: AiInstructionsSetting = {
    current: () => current.current(),
  };
  const feature: FeatureModule = ({ settings }) => {
    current = createSettingsAiInstructions(() => settings().aiInstructions);
  };
  return { feature, aiInstructions };
}
