import { describe, expect, it, vi } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadTaskPanelRelations } from "./read-task-panel-relations";

function setup() {
  const repository = createInMemoryTaskRepository();
  const read = createReadTaskPanelRelations({
    repository,
    clock: createFixedClock("2026-10-09T10:00:00+08:00"),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, read };
}

describe("read task panel relations", () => {
  it("reads the task graph once for every part", async () => {
    const { repository, read } = setup();
    repository.addTask({ id: 1, text: "Paint the house", status: "todo" });
    repository.addTask(
      { id: 2, text: "Buy paint", status: "todo" },
      { parentId: 1 },
    );
    const graphReads = vi.spyOn(repository, "readTaskGraph");

    const relations = await read(1);

    expect(graphReads).toHaveBeenCalledTimes(1);
    expect(relations.reasons.reasons.map((reason) => reason.kind)).toEqual([
      "subtasks",
    ]);
    expect(relations.dependencyCandidates.map((c) => c.id)).toEqual([2]);
    expect(relations.waiters).toEqual([]);
    expect(relations.projectOfTask.project).toBeNull();
    expect(relations.projectCandidates).toEqual([]);
  });

  it("reads every part of a mirror block's ID as its source task's", async () => {
    const { repository, read } = setup();
    repository.addTask({ id: 1, text: "Paint the house", status: "todo" });
    repository.addTask(
      { id: 2, text: "Buy paint", status: "todo" },
      { parentId: 1 },
    );
    repository.addMirror(50, 2);

    const relations = await read(50);

    expect(relations.waiters.map((waiter) => waiter.id)).toEqual([1]);
    // The source task is not offered as its own dependency.
    expect(relations.dependencyCandidates.map((c) => c.id)).toEqual([1]);
  });

  it("gives empty parts for a block that is not a task", async () => {
    const { repository, read } = setup();
    repository.addBlock(9);

    const relations = await read(9);

    expect(relations.reasons.reasons).toEqual([]);
    expect(relations.waiters).toEqual([]);
    expect(relations.projectOfTask).toEqual({
      project: null,
      source: null,
      ownSetting: null,
    });
  });
});
