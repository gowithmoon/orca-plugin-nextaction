import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadProjectForPanel } from "./read-project-for-panel";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readProjectForPanel = createReadProjectForPanel({ repository });
  return { repository, readProjectForPanel };
}

describe("read a project for the project panel", () => {
  it("reads the project with every built-in property", async () => {
    const { repository, readProjectForPanel } = setup();
    repository.addProject({
      id: 10,
      text: "Move house",
      status: "active",
      goal: "Keys handed over",
      start: { year: 2026, month: 10, day: 1 },
      due: { year: 2026, month: 12, day: 31 },
      importance: 6,
      urgency: 2,
    });

    expect(await readProjectForPanel(10)).toMatchObject({
      project: {
        id: 10,
        text: "Move house",
        status: "active",
        goal: "Keys handed over",
        start: { year: 2026, month: 10, day: 1 },
        due: { year: 2026, month: 12, day: 31 },
        importance: 6,
        urgency: 2,
      },
    });
  });

  it("a block that is not a project reads as none", async () => {
    const { repository, readProjectForPanel } = setup();
    repository.addBlock(7);
    repository.addTask({ id: 1 });

    expect(await readProjectForPanel(7)).toBeNull();
    expect(await readProjectForPanel(1)).toBeNull();
    expect(await readProjectForPanel(99)).toBeNull();
  });

  it("while the project tag is paused, it reads as none", async () => {
    const { repository, readProjectForPanel } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.pauseProjectTag(true);

    expect(await readProjectForPanel(10)).toBeNull();
  });
});
