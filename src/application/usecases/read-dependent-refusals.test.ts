import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { readTaskPanelPart } from "../../../tests/task-panel-relations";
import { createReadDependentRefusals } from "./read-dependent-refusals";

describe("read dependent refusals", () => {
  it("refuses the task itself as its own dependent", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Fix the sink" });
    repository.addTask({ id: 2, text: "Call the plumber" });
    const readDependentRefusals = createReadDependentRefusals({ repository });

    const refusals = await readDependentRefusals(1);

    expect([...refusals]).toEqual([[1, "self"]]);
  });

  it("refuses a task that already depends on it", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Buy parts" });
    repository.addTask({ id: 2, text: "Fix the sink", dependencies: [1] });
    repository.addTask({ id: 3, text: "Tidy up" });
    const readDependentRefusals = createReadDependentRefusals({ repository });

    const refusals = await readDependentRefusals(1);

    expect(refusals.get(2)).toBe("already");
    expect(refusals.has(3)).toBe(false);
  });

  it("refuses every task it is below: its parent tasks and theirs", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Move house" });
    repository.addTask({ id: 2, text: "Pack" }, { parentId: 1 });
    repository.addTask({ id: 3, text: "Pack the kitchen" }, { parentId: 2 });
    repository.addTask({ id: 4, text: "Pack the books" }, { parentId: 2 });
    const readDependentRefusals = createReadDependentRefusals({ repository });

    const refusals = await readDependentRefusals(3);

    expect(refusals.get(1)).toBe("below");
    expect(refusals.get(2)).toBe("below");
    expect(refusals.has(4)).toBe(false);
  });

  it("refuses a task it already waits for, and the tasks above that one", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Renovate" });
    repository.addTask({ id: 2, text: "Get a quote" }, { parentId: 1 });
    repository.addTask({ id: 3, text: "Hire builders", dependencies: [2] });
    repository.addTask({ id: 4, text: "Tidy up" });
    const readDependentRefusals = createReadDependentRefusals({ repository });

    const refusals = await readDependentRefusals(3);

    // 3 waits for 2. Were 2 to depend on 3, they would wait for each other;
    // were 1 to depend on 3, its subtask 2 would wait for 3 as well.
    expect(refusals.get(2)).toBe("waits");
    expect(refusals.get(1)).toBe("waits");
    expect(refusals.has(4)).toBe(false);
  });

  it("agrees with the dependency candidates on every pair of tasks", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Move house", sequential: true });
    repository.addTask({ id: 2, text: "Pack" }, { parentId: 1 });
    repository.addTask({ id: 3, text: "Load the van" }, { parentId: 1 });
    repository.addTask({ id: 4, text: "Pack books" }, { parentId: 2 });
    repository.addTask({ id: 5, text: "Book a van", dependencies: [4] });
    repository.addTask({ id: 6, text: "Tell the bank", dependencies: [5] });
    repository.addTask({ id: 7, text: "Sell the sofa" });
    repository.addTask({ id: 8, text: "List it online" }, { parentId: 7 });
    repository.addTask({ id: 9, text: "Clean", dependencies: [3, 8] });
    const readDependentRefusals = createReadDependentRefusals({ repository });
    const readDependencyCandidates = readTaskPanelPart(
      repository,
      "dependencyCandidates",
    );
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    for (const dependedOn of ids) {
      const refusals = await readDependentRefusals(dependedOn);
      for (const dependent of ids) {
        if (dependent === dependedOn) continue;
        const candidate = (await readDependencyCandidates(dependent)).find(
          (c) => c.id === dependedOn,
        );
        const refusal = refusals.get(dependent);
        const cycle =
          refusal === "below" || refusal === "waits" ? refusal : null;
        // "already" stands for a dependency the panel lists, not offers.
        if (refusal === "already") continue;
        expect([dependent, dependedOn, cycle]).toEqual([
          dependent,
          dependedOn,
          candidate?.cycle,
        ]);
      }
    }
  });
});
