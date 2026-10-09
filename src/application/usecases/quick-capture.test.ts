import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createQuickCapture } from "./quick-capture";

describe("quick capture", () => {
  it.each(["", "   ", "\t\n "])(
    "writes nothing for blank text %j",
    async (text) => {
      const repository = createInMemoryTaskRepository();
      const clock = createFixedClock("2026-10-08T10:00:00+08:00");
      const quickCapture = createQuickCapture({ repository, clock });

      expect(await quickCapture(text)).toEqual({ kind: "empty" });
      expect(repository.writeCount()).toBe(0);
    },
  );

  it("writes nothing for blank text, even with initial properties", async () => {
    const repository = createInMemoryTaskRepository();
    const quickCapture = createQuickCapture({
      repository,
      clock: createFixedClock("2026-10-08T10:00:00+08:00"),
    });

    const result = await quickCapture("  ", {
      importance: 7,
      due: { year: 2026, month: 10, day: 20 },
    });

    expect(result).toEqual({ kind: "empty" });
    expect(repository.writeCount()).toBe(0);
  });

  it("creates an inbox task with the text in today's journal", async () => {
    const repository = createInMemoryTaskRepository();
    const clock = createFixedClock("2026-10-08T10:00:00+08:00");
    const quickCapture = createQuickCapture({ repository, clock });

    const result = await quickCapture("  Buy #milk **now**  ");

    expect(result.kind).toBe("captured");
    if (result.kind !== "captured") return;
    expect(await repository.getTask(result.id)).toMatchObject({
      id: result.id,
      text: "Buy #milk **now**",
      status: "inbox",
      importance: 4,
      effort: 4,
      start: null,
      due: null,
    });
    expect(repository.journalOf(result.id)).toEqual({
      year: 2026,
      month: 10,
      day: 8,
    });
  });

  it("captures the task with the initial properties given", async () => {
    const repository = createInMemoryTaskRepository();
    const clock = createFixedClock("2026-10-08T10:00:00+08:00");
    const quickCapture = createQuickCapture({ repository, clock });

    const result = await quickCapture("Plan the trip", {
      importance: 6,
      effort: 2,
      start: { year: 2026, month: 10, day: 12 },
      due: { year: 2026, month: 10, day: 20 },
    });

    if (result.kind !== "captured") throw new Error("not captured");
    expect(await repository.getTask(result.id)).toMatchObject({
      text: "Plan the trip",
      status: "inbox",
      importance: 6,
      effort: 2,
      start: { year: 2026, month: 10, day: 12 },
      due: { year: 2026, month: 10, day: 20 },
    });
  });

  it("gives the properties not set their defaults", async () => {
    const repository = createInMemoryTaskRepository();
    const clock = createFixedClock("2026-10-08T10:00:00+08:00");
    const quickCapture = createQuickCapture({ repository, clock });

    const result = await quickCapture("Renew passport", {
      effort: 6,
      due: { year: 2026, month: 11, day: 1 },
    });

    if (result.kind !== "captured") throw new Error("not captured");
    expect(await repository.getTask(result.id)).toMatchObject({
      status: "inbox",
      importance: 4,
      effort: 6,
      start: null,
      due: { year: 2026, month: 11, day: 1 },
    });
  });

  it("puts a task captured before the day boundary in that calendar day's journal", async () => {
    const repository = createInMemoryTaskRepository();
    // 2:00, before the default 5:00 boundary: logical day is still Oct 8.
    const clock = createFixedClock("2026-10-09T02:00:00+08:00");
    const quickCapture = createQuickCapture({ repository, clock });

    const result = await quickCapture("Late idea");

    if (result.kind !== "captured") throw new Error("not captured");
    expect(repository.journalOf(result.id)).toEqual({
      year: 2026,
      month: 10,
      day: 9,
    });
  });

  it("throws when the write fails, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    const failure = new Error("Orca is gone");
    repository.failWrites(failure);
    const quickCapture = createQuickCapture({
      repository,
      clock: createFixedClock("2026-10-08T10:00:00+08:00"),
    });

    await expect(
      quickCapture("Call mum", {
        importance: 6,
        start: { year: 2026, month: 10, day: 9 },
      }),
    ).rejects.toBe(failure);
    expect(await repository.queryTasks({})).toEqual([]);
  });
});
