// Use case: write the AI summary to today's journal (GLOSSARY: AI 小结,
// #205): the text as the user edited it, below a first line the plugin adds
// naming the review's day, in one undo (ADR 0026).

import type { CalendarDate } from "../../domain/task/task";
import { logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { TaskRepository } from "../ports/task-repository";

/** What writing did. `empty`: the text was blank, nothing written. */
export type WriteSummaryToJournalResult =
  | { readonly kind: "written" }
  | { readonly kind: "empty" };

/**
 * Writes `text` (trimmed) at the end of today's journal, the calendar day
 * (ADR 0005), as the children of a first line naming the review's logical
 * day; blank text writes nothing. Errors are thrown as they are, for `ui` to
 * report; a failed write writes nothing.
 */
export type WriteSummaryToJournal = (
  text: string,
) => Promise<WriteSummaryToJournalResult>;

export function createWriteSummaryToJournal(deps: {
  repository: Pick<TaskRepository, "appendTextToJournal">;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  /** The first line for the review's logical day: "AI 小结（10月18日 周日）". */
  summaryTitle: (day: CalendarDate) => string;
}): WriteSummaryToJournal {
  return async (text) => {
    const body = text.trim();
    if (body === "") return { kind: "empty" };
    const now = deps.clock.now();
    await deps.repository.appendTextToJournal(
      deps.summaryTitle(logicalDay(now, deps.dayBoundary.current())),
      body,
      now,
    );
    return { kind: "written" };
  };
}
