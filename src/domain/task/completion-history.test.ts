import { describe, expect, it } from "vitest";
import {
  type CompletionEntry,
  historyAfterStatusChange,
} from "./completion-history";
import { type TaskStatus, taskStatuses } from "./task";

const earlier: CompletionEntry = {
  at: new Date("2026-10-01T02:00:00.000Z"),
  day: { year: 2026, month: 10, day: 1 },
};
const completion: CompletionEntry = {
  at: new Date("2026-10-08T01:30:00.000Z"),
  day: { year: 2026, month: 10, day: 8 },
};

const notDone = taskStatuses.filter((s) => s !== "done");
const pairs = (froms: readonly TaskStatus[], tos: readonly TaskStatus[]) =>
  froms.flatMap((from) => tos.map((to) => [from, to] as const));

describe("completion history after a status change", () => {
  it.each(notDone)("%s → done appends one completion at the end", (from) => {
    expect(
      historyAfterStatusChange([earlier], from, "done", completion),
    ).toEqual([earlier, completion]);
    expect(historyAfterStatusChange([], from, "done", completion)).toEqual([
      completion,
    ]);
  });

  it("done → done leaves the history as it is", () => {
    expect(
      historyAfterStatusChange([earlier], "done", "done", completion),
    ).toEqual([earlier]);
  });

  it.each(notDone)("done → %s keeps the history", (to) => {
    expect(historyAfterStatusChange([earlier], "done", to, completion)).toEqual(
      [earlier],
    );
  });

  it.each(pairs(notDone, notDone))(
    "%s → %s leaves the history as it is",
    (from, to) => {
      expect(historyAfterStatusChange([earlier], from, to, completion)).toEqual(
        [earlier],
      );
    },
  );
});
