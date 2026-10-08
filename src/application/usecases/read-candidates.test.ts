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

    const candidates = await readCandidates("contexts");

    expect([...candidates].sort()).toEqual([
      "@home",
      "@office",
      "@phone",
      "errand",
    ]);
  });

  it("offers a value written to a task from then on, even after the task drops it", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 3 });
    const editTask = createEditTask({ repository });
    const readCandidates = createReadCandidates({ repository });

    await editTask(3, { labels: ["urgent"] });
    await editTask(3, { labels: [] });

    expect(await readCandidates("labels")).toEqual(["urgent"]);
    expect(await readCandidates("contexts")).toEqual([]);
  });
});
