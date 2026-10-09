import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadDependencyCandidates } from "./read-dependency-candidates";

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
    const readDependencyCandidates = createReadDependencyCandidates({
      repository,
    });

    expect(await readDependencyCandidates(1)).toEqual([
      { id: 2, text: "Call the plumber" },
      { id: 4, text: "Clear the cupboard" },
    ]);
  });
});
