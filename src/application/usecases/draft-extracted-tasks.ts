// Use case: draft the tasks found in the selected blocks with the AI
// (GLOSSARY: 提取任务, #204). The AI may ask once first; what it gives is a
// draft for the user to check and edit in the window, nothing is written
// here (ADR 0026).
import type { CalendarDate } from "../../domain/task/task";
import { daysInMonth } from "../../domain/time/calendar-days";
import {
  type AiStart,
  nonBlank,
  type Parsed,
  startDraft,
  type ToolSpec,
} from "../ai/conversation";
import { extractMessages, proposeTasksTool } from "../ai/extract-prompts";
import { outlineText } from "../ai/outline-text";
import type { ReadPromptContext } from "../ai/prompt-context";
import type { AiChat } from "../ports/ai-chat";
import type { OutlineBlock, TaskRepository } from "../ports/task-repository";

/** One task the AI found. */
export interface ExtractedTaskItem {
  readonly title: string;
  /** The piece of the source it is based on, for the user to check. */
  readonly quote: string;
  /** Only when the source states it. */
  readonly start?: CalendarDate;
  readonly due?: CalendarDate;
  /** Why the AI is unsure about it; absent when it is sure. */
  readonly uncertain?: string;
}

/**
 * What the AI found: a draft, in the source's order, or `nothing` when
 * there is nothing to extract (the window says so).
 */
export type ExtractDraft =
  | { readonly kind: "draft"; readonly items: readonly ExtractedTaskItem[] }
  | { readonly kind: "nothing" };

/**
 * Asks the AI for the tasks in blocks `blockIds` (in note order) and
 * everything below them. Fails, having written nothing, with
 * `AiDraftFailedError` when the AI gives nothing usable after the retries,
 * `AiRequestFailedError` when a request gets no reply, and
 * `AiCancelledError` once `signal` aborts.
 */
export type DraftExtractedTasks = (
  blockIds: readonly number[],
  signal: AbortSignal,
) => Promise<AiStart<ExtractDraft>>;

/** A `YYYY-MM-DD` string naming a day that exists, or `undefined`. */
function parseDate(value: unknown): CalendarDate | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return undefined;
  }
  return { year, month, day };
}

/** `propose_tasks`' arguments (#201 提取任务). */
export function parseExtractDraft(args: unknown): Parsed<ExtractDraft> {
  const record =
    typeof args === "object" && args !== null
      ? (args as Record<string, unknown>)
      : {};
  if (!Array.isArray(record.items)) {
    return { ok: false, reason: "items must be an array" };
  }
  const items: ExtractedTaskItem[] = [];
  for (const item of record.items) {
    const fields =
      typeof item === "object" && item !== null
        ? (item as Record<string, unknown>)
        : {};
    const title = nonBlank(fields.title);
    if (title === undefined) {
      return {
        ok: false,
        reason: "every item needs a title that is not empty",
      };
    }
    // A date that does not hold drops that field only (#201 对话流程).
    const start = parseDate(fields.start);
    const due = parseDate(fields.due);
    const uncertain = nonBlank(fields.uncertain);
    items.push({
      title,
      quote: nonBlank(fields.quote) ?? "",
      ...(start && { start }),
      ...(due && { due }),
      ...(uncertain !== undefined && { uncertain }),
    });
  }
  // No items: the AI looked and found nothing to do (#201 提取任务).
  if (items.length === 0) return { ok: true, value: { kind: "nothing" } };
  return { ok: true, value: { kind: "draft", items } };
}

const proposeSpec: ToolSpec<ExtractDraft> = {
  tool: proposeTasksTool,
  parse: parseExtractDraft,
};

export function createDraftExtractedTasks(deps: {
  repository: TaskRepository;
  chat: AiChat;
  /** Today, the interface language and the AI instructions, per request. */
  promptContext: ReadPromptContext;
}): DraftExtractedTasks {
  return async (blockIds, signal) => {
    const outlines: OutlineBlock[] = [];
    for (const id of blockIds) {
      const outline = await deps.repository.readOutline(id);
      if (outline) outlines.push(outline);
    }
    const context = await deps.promptContext();
    return startDraft(
      deps.chat,
      extractMessages(outlineText(outlines), context),
      proposeSpec,
      signal,
    );
  };
}
