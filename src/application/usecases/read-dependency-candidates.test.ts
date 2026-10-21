import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { readTaskPanelPart } from "../../../tests/task-panel-relations";
import { matchesSearch } from "../../domain/task/task-search";

describe("read dependency candidates", () => {
  it("offers every task not done, other than the task itself, with its text", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Fix the sink" });
    repository.addTask({ id: 2, text: "Call the plumber", status: "waiting" });
    repository.addTask({ id: 3, text: "Buy parts", status: "done" });
    repository.addTask({
      id: 4,
      text: "Clear the cupboard",
      status: "someday",
    });
    repository.addBlock(5, { text: "Not a task" });
    const readDependencyCandidates = readTaskPanelPart(
      repository,
      "dependencyCandidates",
    );

    expect(await readDependencyCandidates(1)).toEqual([
      {
        id: 2,
        text: "Call the plumber",
        searchText: "",
        cycle: null,
        recurring: false,
      },
      {
        id: 4,
        text: "Clear the cupboard",
        searchText: "",
        cycle: null,
        recurring: false,
      },
    ]);
  });

  it("marks the candidates that would make a dependency cycle, with why", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Move house" });
    repository.addTask({ id: 2, text: "Pack" }, { parentId: 1 });
    repository.addTask({ id: 3, text: "Book a van", dependencies: [1] });
    repository.addTask({ id: 4, text: "Tell the bank" });
    const readDependencyCandidates = readTaskPanelPart(
      repository,
      "dependencyCandidates",
    );

    const candidates = await readDependencyCandidates(1);

    expect(candidates.map((c) => [c.id, c.cycle])).toEqual([
      [2, "below"],
      [3, "waits"],
      [4, null],
    ]);
  });

  it("says which candidates are recurring tasks (ADR 0021)", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Send the report" });
    repository.addTask({
      id: 2,
      text: "Weekly review",
      recurrence: {
        kind: "rule",
        rule: { period: { interval: 1, unit: "week" }, basis: "schedule" },
      },
    });
    repository.addTask({ id: 3, text: "Draft the report" });
    const readDependencyCandidates = readTaskPanelPart(
      repository,
      "dependencyCandidates",
    );

    const candidates = await readDependencyCandidates(1);

    expect(candidates.map((c) => [c.id, c.recurring])).toEqual([
      [2, true],
      [3, false],
    ]);
  });

  it("offers each candidate with its search text, so a search finds the values in it as well as the text", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Send the report" });
    repository.addTask({
      id: 2,
      text: "Draft the report",
      searchText: "Draft the report #Task,Todo,Zhang San\n",
    });
    repository.addTask({ id: 3, text: "Ask Zhang for the report" });
    repository.addTask({ id: 4, text: "Book a van" });
    const readDependencyCandidates = readTaskPanelPart(
      repository,
      "dependencyCandidates",
    );

    const found = (await readDependencyCandidates(1)).filter((candidate) =>
      matchesSearch("zhang report", candidate),
    );

    expect(found.map((candidate) => candidate.id)).toEqual([2, 3]);
  });
});
