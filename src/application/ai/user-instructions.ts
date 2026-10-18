// The user's AI instructions (GLOSSARY: AI 说明, #203): a block in the notes,
// named in the settings, read with every block below it as an outline and
// sent with every AI request (#201 AI 说明).
import { describeError } from "../../shared/describe-error";
import type { AiInstructionsSetting } from "../ports/ai-instructions-setting";
import type { OutlineBlock, TaskRepository } from "../ports/task-repository";
import { outlineText } from "./outline-text";

/**
 * The user's AI instructions for a request, as an outline of the block the
 * setting names and every block below it; `undefined` when there are none
 * to give.
 */
export type ReadUserInstructions = () => Promise<string | undefined>;

export function createReadUserInstructions(deps: {
  repository: Pick<TaskRepository, "readOutline">;
  setting: AiInstructionsSetting;
  /** Says why the instructions are left out: once for each block named. */
  warn: (message: string) => void;
}): ReadUserInstructions {
  const warned = new Set<number>();
  const warnOnce = (id: number, message: string) => {
    if (warned.has(id)) return;
    warned.add(id);
    deps.warn(message);
  };
  return async () => {
    const id = deps.setting.current();
    if (id === null) return undefined;
    let outline: OutlineBlock | null;
    try {
      outline = await deps.repository.readOutline(id);
    } catch (error) {
      warnOnce(
        id,
        `the AI instructions block ${id} could not be read; AI requests go on without instructions: ${describeError(error)}`,
      );
      return undefined;
    }
    if (!outline) {
      warnOnce(
        id,
        `the AI instructions block ${id} does not exist; AI requests go on without instructions`,
      );
      return undefined;
    }
    return outlineText([outline]);
  };
}
