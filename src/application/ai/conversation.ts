// The conversation shared by the drafting features (#201 对话流程): ask the
// model for one of the plugin's tool calls, answer every other call so the
// conversation can go on, and retry when it gives none that holds. Pure
// logic over the AiChat port.
import {
  AiCancelledError,
  type AiChat,
  type AiMessage,
  type AiReply,
  type AiTool,
  type AiToolCall,
} from "../ports/ai-chat";
import {
  invalidArgumentsResult,
  notAvailableResult,
  notTakenResult,
  textOnlyReminder,
} from "./prompts";

/**
 * The AI gave no draft the plugin can use: its tool arguments did not hold,
 * or it answered in text only, more often than it is retried. Nothing was
 * written.
 */
export class AiDraftFailedError extends Error {
  override name = "AiDraftFailedError";
}

/** What reading a tool call's arguments gave. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

/** A plugin tool offered in a request, with how its arguments are read. */
export interface ToolSpec<T> {
  readonly tool: AiTool;
  /** Reads the arguments, already parsed from JSON. */
  readonly parse: (args: unknown) => Parsed<T>;
}

/**
 * Retries when the arguments do not hold or the reply is text only, together
 * (#201 对话流程: at most 2).
 */
const maxRetries = 2;

/**
 * Rounds in a row where the model only called tools not offered, each
 * answered "not available" (orca-ai A1, A3). Not a retry in #201's sense, but
 * bounded all the same: a model that keeps at it would never end.
 */
const maxNotAvailableRounds = 3;

/** The plugin tool call taken from the model's reply. */
export interface TakenCall<T> {
  /** The name of the tool called. */
  readonly name: string;
  readonly value: T;
  /**
   * The conversation so far, to go on with: the reply, and a result for each
   * of its tool calls, `result` for the one taken.
   */
  readonly continueWith: (result: string) => AiMessage[];
}

/** Sends, and drops the reply once the user has cancelled. */
async function send(
  chat: AiChat,
  messages: readonly AiMessage[],
  tools: readonly AiTool[],
  signal: AbortSignal,
): Promise<AiReply> {
  if (signal.aborted) throw new AiCancelledError("cancelled");
  const reply = await chat.send(messages, tools, signal);
  if (signal.aborted) throw new AiCancelledError("cancelled");
  return reply;
}

function parseCall<T>(call: AiToolCall, spec: ToolSpec<T>): Parsed<T> {
  let args: unknown;
  try {
    args = JSON.parse(call.arguments === "" ? "{}" : call.arguments);
  } catch {
    return { ok: false, reason: "they are not valid JSON" };
  }
  return spec.parse(args);
}

/**
 * Sends `messages` offering the tools of `specs` until the model makes one
 * call among them whose arguments hold, and returns the first such call.
 * Every other call is answered: "not available" for a tool not offered
 * (Orca's own, orca-ai), the reason for arguments that do not hold. Fails
 * with `AiDraftFailedError` after `maxRetries` retries, and with
 * `AiCancelledError` once `signal` aborts; a failed request's
 * `AiRequestFailedError` is thrown as it is.
 */
export async function requestToolCall(
  chat: AiChat,
  messages: readonly AiMessage[],
  specs: readonly ToolSpec<unknown>[],
  signal: AbortSignal,
): Promise<TakenCall<unknown>> {
  const tools = specs.map((spec) => spec.tool);
  let history: AiMessage[] = [...messages];
  let retries = 0;
  let notAvailableRounds = 0;
  for (;;) {
    const reply = await send(chat, history, tools, signal);
    const results = new Map<string, string>();
    let taken: { call: AiToolCall; name: string; value: unknown } | undefined;
    let invalid: string | undefined;
    for (const call of reply.toolCalls) {
      const spec = specs.find((item) => item.tool.name === call.name);
      if (!spec) {
        results.set(call.id, notAvailableResult(tools));
      } else if (taken) {
        results.set(call.id, notTakenResult);
      } else {
        const parsed = parseCall(call, spec);
        if (parsed.ok) {
          taken = { call, name: call.name, value: parsed.value };
        } else {
          results.set(
            call.id,
            invalidArgumentsResult(call.name, parsed.reason),
          );
          invalid ??= parsed.reason;
        }
      }
    }
    const assistant: AiMessage = {
      role: "assistant",
      content: reply.text,
      toolCalls: reply.toolCalls,
      ...(reply.raw !== undefined && { raw: reply.raw }),
    };
    const answered = (taken?: AiToolCall, result?: string): AiMessage[] =>
      reply.toolCalls.map((call) => ({
        role: "tool",
        toolCallId: call.id,
        content:
          call === taken
            ? (result ?? "")
            : (results.get(call.id) ?? notTakenResult),
      }));
    if (taken) {
      const before = history;
      const call = taken.call;
      return {
        name: taken.name,
        value: taken.value,
        continueWith: (result) => [
          ...before,
          assistant,
          ...answered(call, result),
        ],
      };
    }
    if (reply.toolCalls.length === 0) {
      retries += 1;
      if (retries > maxRetries) {
        throw new AiDraftFailedError("the AI answered in text only");
      }
      history = [
        ...history,
        assistant,
        { role: "user", content: textOnlyReminder(tools) },
      ];
    } else if (invalid !== undefined) {
      retries += 1;
      if (retries > maxRetries) {
        throw new AiDraftFailedError(
          `the AI's tool arguments are not valid: ${invalid}`,
        );
      }
      history = [...history, assistant, ...answered()];
    } else {
      notAvailableRounds += 1;
      if (notAvailableRounds > maxNotAvailableRounds) {
        throw new AiDraftFailedError(
          "the AI kept calling tools that are not available",
        );
      }
      history = [...history, assistant, ...answered()];
    }
  }
}

/** A string with something in it after trimming, or `undefined`. */
export function nonBlank(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

/** `ask_questions`' arguments: 1 to 3 questions; more are cut to 3. */
export function parseQuestions(args: unknown): Parsed<string[]> {
  const questions =
    typeof args === "object" && args !== null && "questions" in args
      ? args.questions
      : undefined;
  if (!Array.isArray(questions)) {
    return { ok: false, reason: "questions must be an array of strings" };
  }
  const texts = questions.map(nonBlank);
  if (texts.length === 0 || texts.some((text) => text === undefined)) {
    return {
      ok: false,
      reason: "questions must hold 1 to 3 questions, none of them empty",
    };
  }
  return { ok: true, value: (texts as string[]).slice(0, 3) };
}
