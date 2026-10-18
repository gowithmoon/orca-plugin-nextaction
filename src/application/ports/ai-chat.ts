// The AI chat the plugin drafts with (ADR 0026): Orca's own, as the user set
// it up in Orca's settings. Messages and tools are this plugin's own types,
// not OpenAI's; only infra knows how Orca takes them.

/** A call the model made to a tool. */
export interface AiToolCall {
  readonly id: string;
  readonly name: string;
  /** The arguments as the model wrote them: JSON text, maybe not valid. */
  readonly arguments: string;
}

export type AiMessage =
  | { readonly role: "system" | "user"; readonly content: string }
  | {
      readonly role: "assistant";
      readonly content: string;
      readonly toolCalls: readonly AiToolCall[];
      /** The reply as the chat gave it (`AiReply.raw`), sent back as it is. */
      readonly raw?: unknown;
    }
  /** The result of one tool call, `toolCallId` naming it. */
  | {
      readonly role: "tool";
      readonly toolCallId: string;
      readonly content: string;
    };

/** A tool the plugin offers the model, its parameters as JSON Schema. */
export interface AiTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/** What the model answered: its text, and its tool calls in order. */
export interface AiReply {
  readonly text: string;
  readonly toolCalls: readonly AiToolCall[];
  /**
   * The reply as the chat gave it, for the chat only: a later request sends
   * it back unchanged as the assistant message (orca-ai A2). Absent in tests.
   */
  readonly raw?: unknown;
}

/**
 * The request got no reply: the AI chat is not set up in Orca, the service
 * failed, or Orca's own AI chat is busy (orca-ai). `notified`: Orca has told
 * the user already ("Error calling AI"), so `ui` does not notify again.
 */
export class AiRequestFailedError extends Error {
  override name = "AiRequestFailedError";
  constructor(
    message: string,
    readonly notified: boolean,
  ) {
    super(message);
  }
}

/** The user cancelled (closed the window); a late reply is dropped. */
export class AiCancelledError extends Error {
  override name = "AiCancelledError";
}

export interface AiChat {
  /**
   * Sends `messages` with the plugin's `tools` and returns the model's reply.
   * Orca hands the model tools of its own too (orca-ai), so the reply may
   * call tools not among `tools`. Fails with `AiRequestFailedError` when
   * there is no reply, and with `AiCancelledError` as soon as `signal`
   * aborts.
   */
  send(
    messages: readonly AiMessage[],
    tools: readonly AiTool[],
    signal: AbortSignal,
  ): Promise<AiReply>;
}
