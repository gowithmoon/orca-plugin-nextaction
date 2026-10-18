// Use case: write the AI summary (GLOSSARY: AI 小结, #205): the AI writes a
// summary of look back and the review's lists, given piece by piece as it
// comes. Nothing is written to the notes here (ADR 0026).

import { logicalDay } from "../../domain/time/logical-day";
import {
  type PromptContext,
  pad,
  type SummaryMaterial,
  type SummaryTask,
  summaryMessages,
} from "../ai/prompts";
import type { ReadUserInstructions } from "../ai/user-instructions";
import type { AiChat } from "../ports/ai-chat";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { ReadReview, ReadReviewResult } from "./read-review";

/**
 * Streams the AI summary's text. Fails with `AiRequestFailedError` when the
 * AI gives no text at all, and with `AiCancelledError` once `signal` aborts.
 */
export type WriteAiSummary = (signal: AbortSignal) => AsyncIterable<string>;

/** A listed task as the summary gives it: its text and its project. */
function summaryTask(item: {
  readonly task: { readonly text: string };
  readonly project: { readonly text: string } | null;
}): SummaryTask {
  return { text: item.task.text, project: item.project?.text ?? null };
}

/** A moment as the user's local date and time, "YYYY-MM-DD HH:MM". */
function localMoment(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** The summary's material, from the read review (#201 AI 小结). */
function summaryMaterial(
  read: ReadReviewResult,
  boundary: Parameters<typeof logicalDay>[1],
): SummaryMaterial {
  const { lookBack } = read.steps;
  const entries = [...lookBack.entries]
    // The earliest first, as a period reads.
    .reverse()
    .map((entry) => ({
      kind: entry.kind,
      ...summaryTask(entry),
      on: logicalDay(entry.at, boundary),
    }));
  const strip = ({ kind: _kind, ...task }: (typeof entries)[number]) => task;
  return {
    since: localMoment(lookBack.since),
    done: entries.filter((entry) => entry.kind === "completion").map(strip),
    skipped: entries.filter((entry) => entry.kind === "skip").map(strip),
    // Read with nothing kept, so every one listed is still not done.
    plannedNotDone: lookBack.items.map(summaryTask),
    created: lookBack.created.map(summaryTask),
    overdue: read.steps.overdue.items.map((item) => ({
      ...summaryTask(item),
      due: item.dueOn,
    })),
    dueSoon: read.steps.dueSoon.items.map((item) => ({
      ...summaryTask(item),
      due: item.dueOn,
    })),
    waiting: read.steps.waiting.items.map(summaryTask),
    // The projects step's (#161): lacking a next action, without recent
    // progress, or overdue (#201 AI 小结).
    projects:
      read.projects.kind === "projects"
        ? read.projects.groups
            .flatMap((group) => group.projects)
            .map((node) => ({
              text: node.project.text,
              noNextAction: node.noNextAction,
              noProgress: node.noProgressDays !== null,
              overdue: node.overdue,
            }))
            .filter(
              (node) => node.noNextAction || node.noProgress || node.overdue,
            )
        : [],
    dueForReview: read.steps.dueForReview.total,
  };
}

export function createWriteAiSummary(deps: {
  readReview: ReadReview;
  chat: AiChat;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  /** Orca's interface language, by name, for the summary's language. */
  uiLanguage: () => string;
  /** The user's AI instructions (GLOSSARY: AI 说明), read for each request. */
  userInstructions: ReadUserInstructions;
}): WriteAiSummary {
  return async function* (signal) {
    const boundary = deps.dayBoundary.current();
    const [read, userInstructions] = await Promise.all([
      deps.readReview(),
      deps.userInstructions(),
    ]);
    const context: PromptContext = {
      today: logicalDay(deps.clock.now(), boundary),
      uiLanguage: deps.uiLanguage(),
      ...(userInstructions !== undefined && { userInstructions }),
    };
    yield* deps.chat.stream(
      summaryMessages(summaryMaterial(read, boundary), context),
      signal,
    );
  };
}
