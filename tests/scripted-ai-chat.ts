// An AiChat for use case tests (#201 Testing Decisions): it records every
// request and answers with the replies it was given, in order: `send` and
// `stream` alike, each taking the next answer.
import {
  AiCancelledError,
  type AiChat,
  type AiMessage,
  type AiReply,
  AiRequestFailedError,
} from "../src/application/ports/ai-chat";

/** A scripted stream (#205): the text pieces it gives, in order. */
export interface ScriptedStream {
  readonly stream: readonly string[];
  /** Run after the piece at this index is given, e.g. to cancel. */
  readonly after?: { readonly index: number; readonly run: () => void };
}

/**
 * One scripted answer: a reply; `"fail"` for a request that gets none (Orca
 * returned `null`, or its stream gave no text); a function run when the
 * request comes in, e.g. to cancel while it is under way; or, for `stream`,
 * a stream's pieces.
 */
export type ScriptedAnswer =
  | AiReply
  | "fail"
  | (() => AiReply)
  | ScriptedStream;

const isStream = (answer: ScriptedAnswer): answer is ScriptedStream =>
  typeof answer === "object" && "stream" in answer;

export interface RecordedRequest {
  readonly messages: readonly AiMessage[];
  /** The names of the tools offered, in order; none for a stream. */
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
      if (isStream(answer)) {
        throw new Error(`request ${requests.length} was scripted as a stream`);
      }
      return typeof answer === "function" ? answer() : answer;
    },
    stream(messages, signal) {
      requests.push({ messages: [...messages], tools: [] });
      const index = requests.length;
      const answer = answers[index - 1];
      // As the port says: no text at all fails, an abort cancels at once.
      return (async function* () {
        if (answer === undefined) {
          throw new Error(`no scripted answer for request ${index}`);
        }
        if (answer !== "fail" && !isStream(answer)) {
          throw new Error(`request ${index} was not scripted as a stream`);
        }
        if (answer === "fail" || answer.stream.join("") === "") {
          throw new AiRequestFailedError("no text", true);
        }
        for (const [at, piece] of answer.stream.entries()) {
          if (signal.aborted) throw new AiCancelledError("cancelled");
          yield piece;
          if (answer.after?.index === at) answer.after.run();
        }
        if (signal.aborted) throw new AiCancelledError("cancelled");
      })();
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

/** A stream giving `pieces` in order. */
export function streamReply(...pieces: readonly string[]): ScriptedStream {
  return { stream: pieces };
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
