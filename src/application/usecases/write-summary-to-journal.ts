// Use case: write the AI summary to today's journal (GLOSSARY: AI 小结,
// #205): the text as the user edited it, read into its parts, below a first
// block the plugin adds naming the review's day, in one undo (ADR 0026).

import type { CalendarDate } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import { summaryParts } from "../ai/summary-parts";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";

/** What writing did. `empty`: the text had nothing to write. */
export type WriteSummaryToJournalResult =
  | { readonly kind: "written" }
  | { readonly kind: "empty" };

/**
 * Writes `text`'s parts (`summaryParts`) at the end of today's journal, the
 * calendar day (ADR 0005), below a first block naming the review's logical
 * day; text with no part names and no items writes nothing. Errors are
 * thrown as they are, for `ui` to report; a failed write writes nothing.
 */
export type WriteSummaryToJournal = (
  text: string,
) => Promise<WriteSummaryToJournalResult>;

export function createWriteSummaryToJournal(deps: {
  repository: Pick<TaskRepository, "appendSummaryToJournal">;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  /** The first block for the review's logical day: "NextAction任务回顾小结（10月18日 周日）". */
  summaryTitle: (day: CalendarDate) => string;
}): WriteSummaryToJournal {
  return async (text) => {
    const parts = summaryParts(text);
    if (parts.length === 0) return { kind: "empty" };
    const now = deps.clock.now();
    await deps.repository.appendSummaryToJournal(
      deps.summaryTitle(logicalDay(now, deps.dayBoundary.current())),
      parts,
      now,
    );
    return { kind: "written" };
  };
}
