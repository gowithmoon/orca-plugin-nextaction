import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { readTodaysTaskGraph } from "./todays-task-graph";

function setup(at: string) {
  const repository = createInMemoryTaskRepository();
  const deps = {
    repository,
    clock: createFixedClock(at),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  };
  return { repository, deps };
}

describe("readTodaysTaskGraph", () => {
  it("counts today from the day boundary: 03:00 is still the day before", async () => {
    const { deps } = setup("2026-10-09T03:00:00+08:00");
    const read = await readTodaysTaskGraph(deps);
    expect(read.today).toEqual({ year: 2026, month: 10, day: 8 });
    expect(read.boundary).toEqual({ hours: 5, minutes: 0 });
  });

  it("lets a task starting within the start preview days in, and gives the same last start", async () => {
    const { repository, deps } = setup("2026-10-09T10:00:00+08:00");
    deps.startPreviewDays.set(2);
    repository.addTask({
      id: 1,
      status: "todo",
      start: { year: 2026, month: 10, day: 11 },
    });
    repository.addTask({
      id: 2,
      status: "todo",
      start: { year: 2026, month: 10, day: 12 },
    });
    const read = await readTodaysTaskGraph(deps);
    expect(read.startsBy).toEqual({ year: 2026, month: 10, day: 11 });
    expect(read.graph.nextActions.map((entry) => entry.task.id)).toEqual([1]);
    expect(read.snapshot.tasks).toHaveLength(2);
  });

  it("reads afresh on every call", async () => {
    const { repository, deps } = setup("2026-10-09T10:00:00+08:00");
    expect((await readTodaysTaskGraph(deps)).snapshot.tasks).toHaveLength(0);
    repository.addTask({ id: 1, status: "todo" });
    expect((await readTodaysTaskGraph(deps)).snapshot.tasks).toHaveLength(1);
  });
});
