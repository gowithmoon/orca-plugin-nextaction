// An AiChat for use case tests (#201 Testing Decisions): it records every
// request and answers with the replies it was given, in order.
import {
  type AiChat,
  type AiMessage,
  type AiReply,
  AiRequestFailedError,
} from "../src/application/ports/ai-chat";

/**
 * One scripted answer: a reply; `"fail"` for a request that gets none (Orca
 * returned `null`); or a function run when the request comes in, e.g. to
 * cancel while it is under way.
 */
export type ScriptedAnswer = AiReply | "fail" | (() => AiReply);

export interface RecordedRequest {
  readonly messages: readonly AiMessage[];
  /** The names of the tools offered, in order. */
  readonly tools: readonly string[];
}

export interface ScriptedAiChat extends AiChat {
  requests(): readonly RecordedRequest[];
}

export function createScriptedAiChat(
  answers: readonly ScriptedAnswer[],
): ScriptedAiChat {
  const requests: RecordedRequest[] = [];
  return {
    async send(messages, tools) {
      requests.push({
        messages: [...messages],
        tools: tools.map((tool) => tool.name),
      });
      const answer = answers[requests.length - 1];
      if (answer === undefined) {
        throw new Error(`no scripted answer for request ${requests.length}`);
      }
      if (answer === "fail") throw new AiRequestFailedError("no reply", true);
      return typeof answer === "function" ? answer() : answer;
    },
    requests: () => [...requests],
  };
}

let nextCallId = 0;

/** A reply calling the tools given; `arguments` not a string is written as JSON. */
export function callsReply(
  ...calls: readonly { name: string; arguments: unknown }[]
): AiReply {
  return {
    text: "",
    toolCalls: calls.map((call) => ({
      id: `call-${++nextCallId}`,
      name: call.name,
      arguments:
        typeof call.arguments === "string"
          ? call.arguments
          : JSON.stringify(call.arguments),
    })),
  };
}

/** A reply with text only, calling no tool. */
export function textReply(text: string): AiReply {
  return { text, toolCalls: [] };
}

/** Every message's text in a request, joined, to look for material in. */
export function requestText(request: RecordedRequest | undefined): string {
  return (request?.messages ?? []).map((message) => message.content).join("\n");
}

/** The tool results of a request, in order. */
export function toolResults(
  request: RecordedRequest | undefined,
): { toolCallId: string; content: string }[] {
  return (request?.messages ?? []).flatMap((message) =>
    message.role === "tool"
      ? [{ toolCallId: message.toolCallId, content: message.content }]
      : [],
  );
}
