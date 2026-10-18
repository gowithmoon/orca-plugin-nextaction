// What every AI request is given besides its material (#201 提示词): today's
// logical day, Orca's interface language and the user's AI instructions,
// read afresh for each request. Built once in platform and shared by the AI
// use cases.
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { PromptContext } from "./prompts";
import type { ReadUserInstructions } from "./user-instructions";

/** The prompt context for one request. */
export type ReadPromptContext = () => Promise<PromptContext>;

export function createReadPromptContext(deps: {
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  /** Orca's interface language, by name, for the AI's language. */
  uiLanguage: () => string;
  /** The user's AI instructions (GLOSSARY: AI 说明). */
  userInstructions: ReadUserInstructions;
}): ReadPromptContext {
  return async () => {
    const userInstructions = await deps.userInstructions();
    return {
      today: logicalDay(deps.clock.now(), deps.dayBoundary.current()),
      uiLanguage: deps.uiLanguage(),
      ...(userInstructions !== undefined && { userInstructions }),
    };
  };
}
