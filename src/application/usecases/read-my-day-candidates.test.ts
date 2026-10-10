import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadMyDayCandidates } from "./read-my-day-candidates";

// 2:00 on October 9 in UTC+8: before the 5:00 boundary, still October 8.
const night = "2026-10-09T02:00:00+08:00";
const oct8 = { year: 2026, month: 10, day: 8 };
const oct7 = { year: 2026, month: 10, day: 7 };

describe("read My Day candidates", () => {
  it("offers every task not in today's My Day, done ones included, with its text", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Write the report", status: "todo" });
    repository.addTask(
      { id: 2, text: "Call the plumber", status: "waiting" },
      { myDay: { kind: "readable", entries: [{ day: oct8 }] } },
    );
    repository.addTask({ id: 3, text: "Buy parts", status: "done" });
    repository.addTask(
      { id: 4, text: "Clear the cupboard", status: "someday" },
      { myDay: { kind: "readable", entries: [{ day: oct7 }] } },
    );
    repository.addBlock(5, { text: "Not a task" });
    const readMyDayCandidates = createReadMyDayCandidates({
      repository,
      clock: createFixedClock(night),
      dayBoundary: createFixedDayBoundary(),
    });

    expect(await readMyDayCandidates()).toEqual([
      { id: 1, text: "Write the report" },
      { id: 3, text: "Buy parts" },
      { id: 4, text: "Clear the cupboard" },
    ]);
  });
});
