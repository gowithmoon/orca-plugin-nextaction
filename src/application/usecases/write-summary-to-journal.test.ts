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
    summaryTitle: (day: CalendarDate) =>
      `NextAction review summary (${day.month}/${day.day})`,
  });
  return { repository, writeSummaryToJournal };
}

const october = (day: number) => ({ year: 2026, month: 10, day });

describe("write summary to journal", () => {
  it("writes the edited text's parts and their items below a first block naming the review's day, at the end of today's journal", async () => {
    const { repository, writeSummaryToJournal } = setup();

    const result = await writeSummaryToJournal(
      "This period\n- You moved house.\n- #done stays text\nWorth noting\n- Pay the rent is overdue",
    );

    expect(result).toEqual({ kind: "written" });
    expect(repository.journalSummaries()).toEqual([
      {
        day: october(18),
        title: "NextAction review summary (10/18)",
        parts: [
          {
            heading: "This period",
            items: ["You moved house.", "#done stays text"],
          },
          { heading: "Worth noting", items: ["Pay the rent is overdue"] },
        ],
      },
    ]);
  });

  it("writes the text as the user edited it: an item added, a part removed", async () => {
    const { repository, writeSummaryToJournal } = setup();

    await writeSummaryToJournal("- My own line\nWorth noting\n- One\n- Two");

    expect(repository.journalSummaries()[0]?.parts).toEqual([
      { heading: "", items: ["My own line"] },
      { heading: "Worth noting", items: ["One", "Two"] },
    ]);
  });

  it("names the review's logical day but writes to the calendar day's journal before the day boundary", async () => {
    // October 19, 03:00 in UTC+8: still the logical day October 18.
    const { repository, writeSummaryToJournal } = setup(
      "2026-10-19T03:00:00+08:00",
    );

    await writeSummaryToJournal("This period\n- Late review");

    expect(repository.journalSummaries()).toEqual([
      {
        day: october(19),
        title: "NextAction review summary (10/18)",
        parts: [{ heading: "This period", items: ["Late review"] }],
      },
    ]);
  });

  it("writes nothing for blank text, or text with nothing but empty items", async () => {
    const { repository, writeSummaryToJournal } = setup();

    expect(await writeSummaryToJournal("  \n ")).toEqual({ kind: "empty" });
    expect(await writeSummaryToJournal("- \n-\n")).toEqual({ kind: "empty" });
    expect(repository.journalSummaries()).toEqual([]);
    expect(repository.writeCount()).toBe(0);
  });

  it("fails, writing nothing, when the write fails", async () => {
    const { repository, writeSummaryToJournal } = setup();
    repository.failWrites(new Error("no note panel"));

    await expect(writeSummaryToJournal("This period\n- One")).rejects.toThrow(
      "no note panel",
    );
    expect(repository.journalSummaries()).toEqual([]);
  });
});
