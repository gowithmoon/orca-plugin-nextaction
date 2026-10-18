// The prompt and tool of "Extract tasks" (#201 提示词 提取任务). Pure. Written
// in English with the meaning of the Chinese original in #201, which it must
// not drift from; the shared opening is prompts.ts'.
import type { AiMessage, AiTool } from "../ports/ai-chat";
import { alreadyTaskMarker } from "./outline-text";
import { type PromptContext, sharedOpening } from "./prompts";

export const proposeTasksName = "propose_tasks";

/** `propose_tasks` (#201 提取任务): no items for nothing to extract. */
export const proposeTasksTool: AiTool = {
  name: proposeTasksName,
  description:
    "Give the draft of the tasks found in the source, in the order they appear there. Give no items when there is nothing to extract.",
  parameters: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            quote: {
              type: "string",
              description:
                "The piece of the source text this task is based on.",
            },
            start: {
              type: "string",
              description:
                "Start date as YYYY-MM-DD, only when the source states it.",
            },
            due: {
              type: "string",
              description:
                "Due date as YYYY-MM-DD, only when the source states it.",
            },
            uncertain: {
              type: "string",
              description:
                "Why you are unsure about this item; omit when sure.",
            },
          },
          required: ["title", "quote"],
        },
      },
    },
    required: ["items"],
  },
};

/** The messages that start "Extract tasks"; `source` is the outline. */
export function extractMessages(
  source: string,
  context: PromptContext,
): AiMessage[] {
  return [
    { role: "system", content: sharedOpening(context) },
    {
      role: "user",
      content: `The user selected part of a note. Find the things in it the user needs to do, as a draft of tasks. The source is an indented outline; blocks marked ${alreadyTaskMarker} are tasks already.

Rules for deciding:
- Only extract what the user needs to do themselves, or needs to follow up on. Do not extract plain information, things already done, or things that clearly belong to someone else and need no follow-up from the user.
- Do not extract blocks that are tasks already.
- One thing in the source is one task; do not split it into steps (splitting is another feature).
- Start task names with a verb, keep the source's wording as far as possible, usually no longer than 30 characters.
- List them in the order they appear in the source.
- Give each one the piece of the source text it is based on (quote), so the user can check it.

<source>
${source}
</source>`,
    },
  ];
}
