import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createEditTask } from "./edit-task";
import { createReadCandidates } from "./read-candidates";

describe("read candidate values", () => {
  it("lists the task tag's choices and the values tasks already use, each once", async () => {
    const repository = createInMemoryTaskRepository();
    repository.setChoices("contexts", ["@home", "@office"]);
    repository.addTask({ id: 1, contexts: ["@office", "@phone"] });
    repository.addTask({ id: 2, contexts: ["@phone", "errand"] });
    const readCandidates = createReadCandidates({ repository });

    const candidates = await readCandidates();

    expect([...candidates.contexts].sort()).toEqual([
      "@home",
      "@office",
      "@phone",
      "errand",
    ]);
  });

  it("offers a context written to a task from then on, even after the task drops it", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 3 });
    const editTask = createEditTask({ repository });
    const readCandidates = createReadCandidates({ repository });

    await editTask(3, { contexts: ["@phone"] });
    await editTask(3, { contexts: [] });

    expect((await readCandidates()).contexts).toEqual(["@phone"]);
  });

  it("lists the tags tasks hold, each once, and no other tag (#224)", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, tags: ["客户A", "写作"] });
    repository.addTask({ id: 2, tags: ["写作"] });
    repository.addTask({ id: 3, tags: [] });
    const readCandidates = createReadCandidates({ repository });

    const candidates = await readCandidates();

    expect([...candidates.tags].sort()).toEqual(["写作", "客户A"].sort());
  });
});
