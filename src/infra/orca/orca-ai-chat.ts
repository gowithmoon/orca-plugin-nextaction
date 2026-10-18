// The AiChat port on Orca's `orca.ai` (ADR 0026, orca-ai): the AI chat the
// user set up in Orca's settings. The only module that calls `orca.ai`
// (tests/architecture.test.ts). Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import {
  AiCancelledError,
  type AiChat,
  type AiMessage,
  AiRequestFailedError,
  type AiToolCall,
} from "../../application/ports/ai-chat";
import { describeError } from "../../shared/describe-error";

/** A message as the OpenAI chat interface Orca passes on takes it. */
type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

function toChatMessage(message: AiMessage): unknown {
  switch (message.role) {
    case "system":
    case "user":
      return { role: message.role, content: message.content };
    case "assistant":
      // The reply as Orca gave it goes back unchanged (orca-ai A2, A3).
      if (message.raw !== undefined) return message.raw;
      return {
        role: "assistant",
        content: message.content,
        ...(message.toolCalls.length > 0 && {
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.arguments },
          })),
        }),
      } satisfies ChatMessage;
    case "tool":
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content,
      } satisfies ChatMessage;
  }
}

/** The tool calls of a reply's message, those with a function only. */
function toolCallsOf(message: unknown): AiToolCall[] {
  const calls =
    typeof message === "object" && message !== null && "tool_calls" in message
      ? message.tool_calls
      : undefined;
  if (!Array.isArray(calls)) return [];
  const read: AiToolCall[] = [];
  for (const call of calls) {
    const fn = typeof call === "object" && call !== null ? call.function : null;
    if (typeof call?.id !== "string" || typeof fn?.name !== "string") continue;
    read.push({
      id: call.id,
      name: fn.name,
      arguments: typeof fn.arguments === "string" ? fn.arguments : "",
    });
  }
  return read;
}

export function createOrcaAiChat(): AiChat {
  return {
    async send(messages, tools, signal) {
      if (signal.aborted) throw new AiCancelledError("cancelled");
      // sendMessage cannot be aborted: a reply coming after the user
      // cancelled is dropped once it arrives.
      let response: unknown;
      try {
        response = await orca.ai.sendMessage(
          messages.map(toChatMessage) as never,
          {
            extraTools: tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })) as never,
          },
        );
      } catch (error) {
        // Orca catches request errors itself (orca-ai); not expected.
        throw new AiRequestFailedError(describeError(error), false);
      }
      // `null`: the request failed (the AI chat not set up included) or
      // Orca's own AI chat is busy; Orca has told the user (orca-ai).
      const message =
        typeof response === "object" &&
        response !== null &&
        "choices" in response &&
        Array.isArray(response.choices)
          ? response.choices[0]?.message
          : undefined;
      if (typeof message !== "object" || message === null) {
        throw new AiRequestFailedError(
          `orca.ai.sendMessage returned ${response === null ? "null" : "no message"}`,
          response === null,
        );
      }
      if (signal.aborted) throw new AiCancelledError("cancelled");
      const content = "content" in message ? message.content : null;
      return {
        text: typeof content === "string" ? content : "",
        toolCalls: toolCallsOf(message),
        raw: message,
      };
    },

    async *stream(messages, signal) {
      if (signal.aborted) throw new AiCancelledError("cancelled");
      // Orca stops the stream on abort without throwing (orca-ai A5). The
      // caller's signal is checked at every piece (infra adds no listener,
      // tests/architecture.test.ts); stopping early for any reason aborts
      // Orca's request in `finally`.
      const controller = new AbortController();
      let gave = false;
      try {
        let pieces: AsyncIterable<unknown>;
        try {
          pieces = orca.ai.sendStreamMessage(
            messages.map(toChatMessage) as never,
            controller,
          );
        } catch (error) {
          throw new AiRequestFailedError(describeError(error), false);
        }
        try {
          for await (const delta of pieces) {
            if (signal.aborted) break;
            // Only the text; `reasoning_content` is left out (orca-ai A4).
            const content =
              typeof delta === "object" && delta !== null && "content" in delta
                ? delta.content
                : null;
            if (typeof content !== "string" || content === "") continue;
            gave = true;
            yield content;
          }
        } catch (error) {
          if (signal.aborted) throw new AiCancelledError("cancelled");
          // Orca catches request errors itself (orca-ai); not expected.
          throw new AiRequestFailedError(describeError(error), false);
        }
      } finally {
        // Done, cancelled, failed, or the caller stopped reading: either way
        // Orca need not go on (aborting a finished stream does nothing).
        controller.abort();
      }
      if (signal.aborted) throw new AiCancelledError("cancelled");
      // No text at all: the request failed (the AI chat not set up
      // included) or Orca's own AI chat is busy; Orca has told the user
      // (orca-ai).
      if (!gave) {
        throw new AiRequestFailedError(
          "orca.ai.sendStreamMessage gave no text",
          true,
        );
      }
    },
  };
}
