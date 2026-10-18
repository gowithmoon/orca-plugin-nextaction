import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { CalendarDate } from "../../domain/task/task";
import { createWriteSummaryToJournal } from "./write-summary-to-journal";

function setup(now = "2026-10-18T09:00:00+08:00") {
  const repository = createInMemoryTaskRepository();
  const writeSummaryToJournal = createWriteSummaryToJournal({
    repository,
    clock: createFixedClock(now),
    dayBoundary: createFixedDayBoundary(),
    // As the plugin words it, here without translation.
    summaryTitle: (day: CalendarDate) => `AI summary (${day.month}/${day.day})`,
  });
  return { repository, writeSummaryToJournal };
}

const october = (day: number) => ({ year: 2026, month: 10, day });

describe("write summary to journal", () => {
  it("writes the edited text below a first line naming the review's day, at the end of today's journal", async () => {
    const { repository, writeSummaryToJournal } = setup();

    const result = await writeSummaryToJournal(
      "This period\nYou moved house. #done stays text",
    );

    expect(result).toEqual({ kind: "written" });
    expect(repository.journalTexts()).toEqual([
      {
        day: october(18),
        title: "AI summary (10/18)",
        body: "This period\nYou moved house. #done stays text",
      },
    ]);
  });

  it("names the review's logical day but writes to the calendar day's journal before the day boundary", async () => {
    // October 19, 03:00 in UTC+8: still the logical day October 18.
    const { repository, writeSummaryToJournal } = setup(
      "2026-10-19T03:00:00+08:00",
    );

    await writeSummaryToJournal("Late review");

    expect(repository.journalTexts()).toEqual([
      { day: october(19), title: "AI summary (10/18)", body: "Late review" },
    ]);
  });

  it("writes nothing for blank text", async () => {
    const { repository, writeSummaryToJournal } = setup();

    expect(await writeSummaryToJournal("  \n ")).toEqual({ kind: "empty" });
    expect(repository.journalTexts()).toEqual([]);
    expect(repository.writeCount()).toBe(0);
  });

  it("fails, writing nothing, when the write fails", async () => {
    const { repository, writeSummaryToJournal } = setup();
    repository.failWrites(new Error("no note panel"));

    await expect(writeSummaryToJournal("This period")).rejects.toThrow(
      "no note panel",
    );
    expect(repository.journalTexts()).toEqual([]);
  });
});
